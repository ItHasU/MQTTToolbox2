import { AppTypes } from "@mqtt-toolbox/shared/src/app/types";
import { APP_MODEL } from "@mqtt-toolbox/shared/src/entities/model";
import { AppContexts } from "@mqtt-toolbox/shared/src/entities/contexts";
import { AppEntityTypes } from "@mqtt-toolbox/shared/src/entities/types";
import { RequestOptions } from "@dagda/server/src/api";
import { AbstractServerApp } from "@dagda/server/src/app";
import { Data } from "@dagda/shared/src/entities/tools/adapters";
import { Migration } from "@dagda/server/src/sql/migrations";
import { assertUnreachable } from "@dagda/shared/src/tools/asserts";
import { PublishMessageParams, SchedulePublishParams } from "@mqtt-toolbox/shared/src/actions";
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

export class ServerApp extends AbstractServerApp<AppTypes, AppSettings> {

    /** Set by listen(), once the settings it reads have been loaded */
    protected _broker: BrokerConnection | null = null;
    protected _ingestor: MessageIngestor | null = null;
    /** Built in the constructor: scheduling a publish needs no broker, only firing one does (ROADMAP tranche 2) */
    protected readonly _scheduler: PublishScheduler;

    public constructor(...args: ConstructorParameters<typeof AbstractServerApp<AppTypes, AppSettings>>) {
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
        this.registerAction("publishMessage", async (user, params: PublishMessageParams): Promise<void> => {
            await this._publishAndRecord(params, user.id);
        });

        this.registerAction("schedulePublish", async (user, params: SchedulePublishParams) => {
            if (params.sendAt <= Date.now()) {
                throw new Error("The scheduled time must be in the future");
            }
            return this._scheduler.schedule(params, user.id);
        });

        this.registerAction("cancelScheduledPublish", async (_user, params: { id: number }): Promise<void> => {
            this._scheduler.cancel(params.id);
        });

        this.registerAction("listScheduledPublishes", async () => {
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
            broadcast: (contexts) => this.broadcast("contextChanged", contexts)
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

    /** @inheritdoc */
    protected override async _fetch(context: AppContexts, _request: RequestOptions): Promise<Data<AppEntityTypes>> {
        const result: Data<AppEntityTypes> = {};
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
            default: {
                assertUnreachable(context);
            }
        }
        return result;
    }

}
