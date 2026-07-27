import { AppTypes } from "@mqtt-toolbox/shared/src/app/types";
import { APP_MODEL } from "@mqtt-toolbox/shared/src/entities/model";
import { AppContexts } from "@mqtt-toolbox/shared/src/entities/contexts";
import { AppEntityTypes } from "@mqtt-toolbox/shared/src/entities/types";
import { RequestOptions } from "@dagda/server/src/api";
import { AbstractServerApp } from "@dagda/server/src/app";
import { hasPermission } from "@dagda/shared/src/auth/permissions";
import { UserInfo } from "@dagda/shared/src/auth/types";
import { Data } from "@dagda/shared/src/entities/tools/adapters";
import { NotificationRecipientFilter } from "@dagda/shared/src/notification/abstract.notification.handler";
import { Migration } from "@dagda/server/src/sql/migrations";
import { OperationType, SQLTransactionData, SQLTransactionResult } from "@dagda/shared/src/sql/transaction";
import { assertUnreachable } from "@dagda/shared/src/tools/asserts";
import { PublishMessageParams, SchedulePublishParams } from "@mqtt-toolbox/shared/src/actions";
import { AppPreferences } from "@mqtt-toolbox/shared/src/preferences";
import { AppSettings } from "@mqtt-toolbox/shared/src/settings";
import { APP_MIGRATIONS } from "./migrations";
import { BrokerConnection, BrokerState } from "./mqtt/broker";
import { MessageIngestor } from "./mqtt/ingest";
import { PublishScheduler } from "./mqtt/scheduler";

// Physical names, prefixed by the framework (Dagda FEATURES §2).
// Read from the model rather than written by hand, so a rename is caught
// by the compiler instead of at the first query.
const TOPICS = APP_MODEL.getTableSqlName("topics");
const MESSAGES = APP_MODEL.getTableSqlName("messages");
const DASHBOARDS = APP_MODEL.getTableSqlName("dashboards");
const DASHBOARD_SHARES = APP_MODEL.getTableSqlName("dashboard_shares");

export class ServerApp extends AbstractServerApp<AppTypes, AppSettings, AppPreferences> {

    /** Set by listen(), once the settings it reads have been loaded */
    protected _broker: BrokerConnection | null = null;
    protected _ingestor: MessageIngestor | null = null;
    /** Built in the constructor: scheduling a publish needs no broker, only firing one does (ROADMAP tranche 2) */
    protected readonly _scheduler: PublishScheduler;

    public constructor(...args: ConstructorParameters<typeof AbstractServerApp<AppTypes, AppSettings, AppPreferences>>) {
        super(...args);
        this._scheduler = new PublishScheduler({
            publish: (params, userId) => this._publishAndRecord(params, userId),
            onChange: (pending) => this.broadcast("scheduledPublishesChanged", pending)
        });
        // Before listen(): the route must exist before the server accepts its
        // first request. The handlers only reach into this._broker/_ingestor
        // at call time, by which point listen() has set them.
        this._registerActions();
    }

    /** @inheritdoc */
    protected override _migrations(): Migration[] {
        return APP_MIGRATIONS;
    }

    //#region Actions (Dagda FEATURES §11.1) -----------------------------------

    protected _registerActions(): void {
        // Gated on publish.send (review feedback): hiding the Publier page
        // was never access control on its own — these four were reachable by
        // any authenticated account via a direct call regardless of what the
        // menu showed.
        this.registerAction("publishMessage", async (user, params: PublishMessageParams): Promise<void> => {
            this._requirePermission(user, "publish.send");
            await this._publishAndRecord(params, user.id);
        });

        this.registerAction("schedulePublish", async (user, params: SchedulePublishParams) => {
            this._requirePermission(user, "publish.send");
            if (params.sendAt <= Date.now()) {
                throw new Error("The scheduled time must be in the future");
            }
            return this._scheduler.schedule(params, user.id);
        });

        this.registerAction("cancelScheduledPublish", async (user, params: { id: number }): Promise<void> => {
            this._requirePermission(user, "publish.send");
            this._scheduler.cancel(params.id);
        });

        this.registerAction("listScheduledPublishes", async (user) => {
            this._requirePermission(user, "publish.send");
            return this._scheduler.list();
        });
    }

    /**
     * Publish now and record it (FEATURES §3): the one thing an immediate
     * publish and a scheduled one firing both do, so neither the action
     * handler above nor the scheduler duplicates it.
     */
    protected async _publishAndRecord(params: PublishMessageParams, userId: number): Promise<void> {
        if (this._broker == null) {
            throw new Error("The broker connection is not ready yet");
        }
        const payload = Buffer.from(params.payload, "utf-8");
        const options = { retain: params.retain ?? false, qos: params.qos ?? 0 };
        await this._broker.publish(params.topic, payload, options);
        // A second, independent history row from whatever ingest.ts later
        // stores for the same message if the broker echoes it back — see
        // recordManualPublish() for why that duplication is the point.
        this._ingestor?.recordManualPublish(params.topic, payload, options, userId);
    }

    //#endregion

    //#region MQTT ------------------------------------------------------------

    /**
     * Start listening, then connect to the broker (FEATURES §1).
     *
     * In this order because the framework loads the settings as part of
     * listen(), and the connection reads its whole configuration from them.
     */
    public override async listen(): Promise<void> {
        await super.listen();
        this._startBroker();
    }

    protected _startBroker(): void {
        this._ingestor = new MessageIngestor({
            db: this._db,
            settings: this._settings.settings,
            broadcast: (contexts) => this.broadcast("contextChanged", contexts),
            // The dashboard JS API's MQTT.on(topic, callback) (ROADMAP
            // tranche 4, FEATURES §6.2) and <mqtt-value>/<mqtt-json>/etc.'s
            // live updates ride on this, not on a fetch triggered by
            // contextChanged: a value push, not a cache invalidation.
            onMessagesIngested: (messages) => this.broadcast("messagesIngested", messages)
        });

        const ingestor = this._ingestor;
        this._broker = new BrokerConnection({
            settings: this._settings.settings,
            onMessage: (message) => ingestor.ingest(message),
            onStateChanged: (state: BrokerState) => {
                // The status page shows this, and it is the only way a user
                // learns the broker went away (FEATURES §1, §7).
                this.broadcast("brokerStateChanged", state);
            }
        });
        this._broker.start();
    }

    /** State of the broker connection, for a client that just arrived */
    public get brokerState(): BrokerState {
        return this._broker?.state ?? { connected: false };
    }

    /** Close the broker connection and write down what is still pending */
    public async stop(): Promise<void> {
        // Cancels rather than fires: the queue is in-memory only (ROADMAP
        // tranche 2), so whatever a scheduled publish would send is already
        // accepted as lost on a restart — firing it here on a connection
        // about to close would not actually deliver it either.
        this._scheduler.stop();
        await this._broker?.stop();
        await this._ingestor?.stop();
    }

    //#endregion

    /**
     * @inheritdoc
     * `dashboards`/`dashboard` are filtered by `request.user.id` — owned or
     * shared, never anything else (Dagda ROADMAP tranche 4: this is the
     * fetch-level half of the exit gate, notification filtering in
     * `_notificationRecipients()` below is the other). A `{type:"server"}`
     * request has no user to scope by and is trusted by construction (the
     * server's own internal reads, not a browser's) — everything is visible.
     */
    protected override async _fetch(context: AppContexts, request: RequestOptions): Promise<Data<AppEntityTypes>> {
        const result: Data<AppEntityTypes> = {};
        const userId = request.type === "client" ? request.user.id : null;
        switch (context.type) {
            case "topics": {
                // The status page shows every topic with the date of its last
                // message; the messages themselves are fetched per topic.
                result.topics = await this._db.all(`SELECT * FROM ${TOPICS} ORDER BY "name"`);
                break;
            }
            case "topic": {
                const topicId = context.options.topicId;
                result.topics = await this._db.all(`SELECT * FROM ${TOPICS} WHERE "id" = $1`, topicId);
                result.messages = await this._db.all(
                    `SELECT * FROM ${MESSAGES} WHERE "topicId" = $1 ORDER BY "receivedAt" DESC`,
                    topicId
                );
                break;
            }
            case "dashboards": {
                // Visibility (review feedback, superseding the original
                // per-user share model): owned, or public AND imported. The
                // isPublic check re-runs on every fetch — flipping a
                // dashboard private is a live gate, not a one-time grant, so
                // an existing importer loses access the moment it flips,
                // even though their dashboard_shares row is untouched.
                result.dashboards = userId == null
                    ? await this._db.all(`SELECT * FROM ${DASHBOARDS} ORDER BY "sortOrder"`)
                    : await this._db.all(
                        `SELECT DISTINCT d.* FROM ${DASHBOARDS} d
                         LEFT JOIN ${DASHBOARD_SHARES} s ON s."dashboardId" = d."id" AND s."userId" = $1
                         WHERE d."ownerId" = $1 OR (d."isPublic" = true AND s."userId" = $1)
                         ORDER BY d."sortOrder"`,
                        userId
                    );
                // Two distinct needs, both satisfied by this one query: the
                // import rows for dashboards the caller owns (renders
                // "imported by: …" in their own share dialog), and the
                // caller's own import rows on dashboards they don't own
                // (lets the client find its own row's id to leave one —
                // fix for "can't un-import a shared dashboard").
                result.dashboard_shares = userId == null
                    ? await this._db.all(`SELECT * FROM ${DASHBOARD_SHARES}`)
                    : await this._db.all(
                        `SELECT s.* FROM ${DASHBOARD_SHARES} s
                         INNER JOIN ${DASHBOARDS} d ON d."id" = s."dashboardId"
                         WHERE d."ownerId" = $1 OR s."userId" = $1`,
                        userId
                    );
                break;
            }
            case "dashboard": {
                const dashboardId = context.options.dashboardId;
                result.dashboards = userId == null
                    ? await this._db.all(`SELECT * FROM ${DASHBOARDS} WHERE "id" = $1`, dashboardId)
                    : await this._db.all(
                        `SELECT DISTINCT d.* FROM ${DASHBOARDS} d
                         LEFT JOIN ${DASHBOARD_SHARES} s ON s."dashboardId" = d."id" AND s."userId" = $2
                         WHERE d."id" = $1 AND (d."ownerId" = $2 OR (d."isPublic" = true AND s."userId" = $2))`,
                        dashboardId, userId
                    );
                break;
            }
            case "publicDashboards": {
                // Feeds the "Parcourir" dialog: public dashboards the caller
                // neither owns nor has already imported.
                result.dashboards = userId == null
                    ? []
                    : await this._db.all(
                        `SELECT d.* FROM ${DASHBOARDS} d
                         WHERE d."isPublic" = true AND d."ownerId" != $1
                           AND NOT EXISTS (
                               SELECT 1 FROM ${DASHBOARD_SHARES} s
                               WHERE s."dashboardId" = d."id" AND s."userId" = $1
                           )
                         ORDER BY d."sortOrder"`,
                        userId
                    );
                break;
            }
            case "lastMessages": {
                // DISTINCT ON ("topicId") ... ORDER BY "topicId", "receivedAt"
                // DESC: one row per topic, the newest. Same idea as _prune()'s
                // retention query, but across every topic instead of one.
                result.messages = await this._db.all(
                    `SELECT DISTINCT ON ("topicId") * FROM ${MESSAGES} ORDER BY "topicId", "receivedAt" DESC`
                );
                result.topics = await this._db.all(`SELECT * FROM ${TOPICS} ORDER BY "name"`);
                break;
            }
            default: {
                assertUnreachable(context);
            }
        }
        return result;
    }

    /**
     * @inheritdoc
     * Enforces ownership on `dashboards`/`dashboard_shares` before the write
     * runs — the other half of the fetch-level filtering above. A client
     * cannot create a dashboard owned by someone else (the sent `ownerId` is
     * overwritten with the caller's own id, never trusted), cannot write to a
     * dashboard it doesn't own, and cannot create a share for a dashboard it
     * doesn't own. Every other table is untouched, same posture as the
     * framework default.
     */
    protected override async _submit(
        transactionData: SQLTransactionData<AppEntityTypes, AppContexts>,
        request: RequestOptions
    ): Promise<SQLTransactionResult> {
        if (request.type === "client") {
            await this._checkDashboardWriteAccess(transactionData, request.user);
        }
        return super._submit(transactionData, request);
    }

    protected async _checkDashboardWriteAccess(
        transactionData: SQLTransactionData<AppEntityTypes, AppContexts>,
        user: UserInfo
    ): Promise<void> {
        for (const operation of transactionData.operations) {
            if (operation.options.table === "dashboards") {
                if (operation.type === OperationType.INSERT) {
                    if (!hasPermission(user, "dashboards.edit")) {
                        throw new Error("Missing permission: dashboards.edit");
                    }
                    // Never trust a client-sent owner: this is the actual
                    // trust boundary the table exists to enforce. Cast: the
                    // generic `TableName` behind `operation.options` was
                    // already narrowed to "dashboards" by the check above,
                    // but TS does not propagate that through the shared
                    // `SQLOperation<Tables, keyof Tables>` union to `.item`.
                    (operation.options.item as { ownerId: number }).ownerId = user.id;
                } else if (!(await this._ownsDashboard(operation.options.id, user))) {
                    throw new Error("You do not own this dashboard");
                }
            } else if (operation.options.table === "dashboard_shares") {
                if (operation.type === OperationType.INSERT) {
                    // Importing (review feedback, superseding the original
                    // "owner shares with a specific user" model): anyone may
                    // add themselves — never someone else — to a currently
                    // public dashboard's importer list. No permission check:
                    // viewing a shared dashboard has never needed one, same
                    // as listUserNames().
                    const item = operation.options.item as { dashboardId: number, userId: number };
                    if (item.userId !== user.id) {
                        throw new Error("You may only import a dashboard for yourself");
                    }
                    if (!(await this._isDashboardPublic(item.dashboardId))) {
                        throw new Error("This dashboard is not public");
                    }
                } else if (operation.type === OperationType.DELETE) {
                    const share = await this._db.get<{ userId: number, ownerId: number }>(
                        `SELECT s."userId" AS "userId", d."ownerId" AS "ownerId"
                         FROM ${DASHBOARD_SHARES} s INNER JOIN ${DASHBOARDS} d ON d."id" = s."dashboardId"
                         WHERE s."id" = $1`,
                        operation.options.id
                    );
                    // The owner may revoke it; the recipient may leave it.
                    const allowed = share != null && (user.isSuperAdmin || share.ownerId === user.id || share.userId === user.id);
                    if (!allowed) {
                        throw new Error("You may not remove this share");
                    }
                } else {
                    throw new Error("A share cannot be updated, only created or deleted");
                }
            }
        }
    }

    protected async _ownsDashboard(dashboardId: number, user: UserInfo): Promise<boolean> {
        if (user.isSuperAdmin) {
            return true;
        }
        const dashboard = await this._db.get<{ ownerId: number }>(
            `SELECT "ownerId" AS "ownerId" FROM ${DASHBOARDS} WHERE "id" = $1`,
            dashboardId
        );
        return dashboard != null && dashboard.ownerId === user.id;
    }

    protected async _isDashboardPublic(dashboardId: number): Promise<boolean> {
        const dashboard = await this._db.get<{ isPublic: boolean }>(
            `SELECT "isPublic" AS "isPublic" FROM ${DASHBOARDS} WHERE "id" = $1`,
            dashboardId
        );
        return dashboard?.isPublic === true;
    }

    /**
     * @inheritdoc
     * Every other write keeps the framework's default (open, `undefined`) —
     * only `dashboards`/`dashboard_shares` are owned or shared, so only they
     * need narrowing. Resolved before the write runs (called from
     * `AbstractServerApp._submit()` ahead of the actual `submit()`), so a
     * DELETE's rows are still readable when this asks who could see them.
     */
    protected override async _notificationRecipients(
        transactionData: SQLTransactionData<AppEntityTypes, AppContexts>,
        request: RequestOptions
    ): Promise<NotificationRecipientFilter | undefined> {
        const touchesDashboards = transactionData.operations.some(
            (op) => op.options.table === "dashboards" || op.options.table === "dashboard_shares"
        );
        if (!touchesDashboards) {
            return undefined;
        }

        const dashboardIds = new Set<number>();
        for (const operation of transactionData.operations) {
            if (operation.options.table === "dashboards" && operation.type !== OperationType.INSERT) {
                dashboardIds.add(operation.options.id);
            } else if (operation.options.table === "dashboard_shares") {
                if (operation.type === OperationType.INSERT) {
                    dashboardIds.add((operation.options.item as { dashboardId: number }).dashboardId);
                } else if (operation.type === OperationType.DELETE) {
                    const share = await this._db.get<{ dashboardId: number }>(
                        `SELECT "dashboardId" AS "dashboardId" FROM ${DASHBOARD_SHARES} WHERE "id" = $1`,
                        operation.options.id
                    );
                    if (share != null) {
                        dashboardIds.add(share.dashboardId);
                    }
                }
            }
        }
        // A brand-new dashboard (INSERT, no id assigned yet): nobody but its
        // owner has ever seen it, and the owner's own session is excluded
        // separately (self-echo) — there is nothing left to notify.
        if (dashboardIds.size === 0) {
            return () => false;
        }

        const allowed = new Set<number>();
        for (const dashboardId of dashboardIds) {
            // Mirrors the fetch-level visibility rule exactly: an importer
            // of a dashboard that is no longer public must not keep
            // receiving its live updates just because their dashboard_shares
            // row is still there (they've already lost the ability to
            // re-fetch it, so a stray notification would leak content they
            // can no longer legitimately see through a fetch).
            const rows = await this._db.all<{ userId: number }>(
                `SELECT "ownerId" AS "userId" FROM ${DASHBOARDS} WHERE "id" = $1
                 UNION
                 SELECT s."userId" AS "userId" FROM ${DASHBOARD_SHARES} s
                 INNER JOIN ${DASHBOARDS} d ON d."id" = s."dashboardId"
                 WHERE s."dashboardId" = $1 AND d."isPublic" = true`,
                dashboardId
            );
            for (const row of rows) {
                allowed.add(row.userId);
            }
        }
        return (user) => allowed.has(user.id);
    }

}
