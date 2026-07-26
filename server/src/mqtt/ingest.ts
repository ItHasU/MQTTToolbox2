import { AbstractSQLRunner } from "@dagda/server/src/sql/runner";
import { SettingsWriteService } from "@dagda/shared/src/settings/service";
import { AppContexts } from "@mqtt-toolbox/shared/src/entities/contexts";
import { IngestedMessage } from "@mqtt-toolbox/shared/src/entities/events";
import { APP_MODEL, MESSAGE_SOURCE, MessageSource } from "@mqtt-toolbox/shared/src/entities/model";
import { TopicId, TopicName } from "@mqtt-toolbox/shared/src/entities/types";
import { AppSettings } from "@mqtt-toolbox/shared/src/settings";
import { BrokerMessage } from "./broker";

/**
 * Writing the received messages, and telling the clients about it
 * (FEATURES §2, §9, §11).
 *
 * Separate from the connection so that either can be replaced or tested alone:
 * this one never talks to a broker, it takes messages from wherever they come —
 * which is also what publishing from the interface will need (FEATURES §3).
 *
 * Deliberately not going through the entities handler. The handler exists to let
 * a *client* write optimistically against a cache it holds; ingestion has no
 * cache, no user and no optimism, and one fetch-transaction-submit round per
 * message would be the wrong shape at broker throughput.
 */

const TOPICS = APP_MODEL.getTableSqlName("topics");
const MESSAGES = APP_MODEL.getTableSqlName("messages");

export interface MessageIngestorParams {
    db: AbstractSQLRunner;
    settings: SettingsWriteService<AppSettings>["settings"];
    /** Tells the clients which contexts went stale */
    broadcast: (contexts: AppContexts[]) => void;
    /**
     * Tells the clients what was actually ingested (Dagda ROADMAP tranche
     * 4) — `MQTT.on(topic, callback)`'s live-push mechanism, and the fast
     * path for `lastMessages`/`<mqtt-value>` and friends. Optional: an app
     * that hasn't built the dashboard feature yet has nothing to do with it.
     */
    onMessagesIngested?: (messages: IngestedMessage[]) => void;
    /**
     * How long messages accumulate before the clients are told.
     *
     * A broadcast per message would be a firehose on a busy broker, and every
     * client would refetch on each one. Batching costs a little latency and
     * saves a lot of round trips.
     */
    notifyDelayMs?: number;
    log?: (message: string) => void;
}

/** How a payload was stored, decided per message */
export interface EncodedPayload {
    payload: string;
    payloadIsBase64: boolean;
}

/**
 * Store a payload as text when it is text.
 *
 * MQTT payloads are arbitrary bytes, but in practice almost all of them are
 * UTF-8. Valid UTF-8 is stored as-is, which keeps the column readable and
 * searchable in SQL; anything else falls back to base64. This replaces the v1
 * `{type:"Buffer", data:[…]}` encoding (FEATURES §9).
 */
export function encodePayload(payload: Buffer): EncodedPayload {
    // A NUL byte decodes fine as UTF-8 but PostgreSQL refuses it in a text
    // column, so such a payload travels as base64 like any other binary one.
    if (!payload.includes(0x00)) {
        try {
            // fatal: the point is to be told, rather than to get replacement
            // characters that would silently corrupt a binary payload.
            const text = new TextDecoder("utf-8", { fatal: true }).decode(payload);
            return { payload: text, payloadIsBase64: false };
        } catch {
            // Not text, fall through.
        }
    }
    return { payload: payload.toString("base64"), payloadIsBase64: true };
}

export class MessageIngestor {

    protected readonly _params: MessageIngestorParams;
    protected readonly _notifyDelayMs: number;
    protected readonly _log: (message: string) => void;

    /**
     * Topic name to id.
     *
     * Every message needs the id of its topic, and a broker sends the same few
     * topics over and over; without this each one would cost a lookup.
     */
    protected readonly _topicIds: Map<string, number> = new Map();

    /** Writes are chained: two messages on an unknown topic must not both create it */
    protected _queue: Promise<void> = Promise.resolve();

    /**
     * Topics touched since the last notification, each holding its latest
     * message of the batch — only the latest matters for `messagesIngested`
     * (a "current value" push, not a full history; the entity row itself is
     * the history, FEATURES §2) and for `contextChanged`.
     */
    protected _pending: Map<number, IngestedMessage> = new Map();
    protected _notifyTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(params: MessageIngestorParams) {
        this._params = params;
        this._notifyDelayMs = params.notifyDelayMs ?? 200;
        this._log = params.log ?? ((message: string) => console.log(message));
    }

    /**
     * Take a message in.
     *
     * Returns immediately: the broker connection must never wait on a database
     * write. Use flush() to wait for what has been handed over.
     */
    public ingest(message: BrokerMessage, receivedAt: number = Date.now()): void {
        this._enqueue(message.topic, () => this._store(message, receivedAt, MESSAGE_SOURCE.values.EXTERNAL, null));
    }

    /**
     * Record that a message was handed to the broker for publication
     * (MQTTToolbox FEATURES §3, ROADMAP tranche 2).
     *
     * A **second, independent row** from whatever `ingest()` later stores for
     * the same message: this one is stamped the moment the broker accepted
     * the publish, the other whenever — if ever — it actually comes back
     * through the subscription. Comparing the two is the point: it is what
     * shows a manual publish actually reached the broker and came back,
     * rather than just that the button was clicked.
     *
     * Same fire-and-forget contract as `ingest()`: the publish itself already
     * happened by the time this is called, so a failure to record it must not
     * turn into a failure the user sees.
     */
    public recordManualPublish(topic: string, payload: Buffer, options: { retain: boolean, qos: number }, userId: number): void {
        this._enqueue(topic, () => this._store(
            { topic, payload, retain: options.retain, qos: options.qos },
            Date.now(),
            MESSAGE_SOURCE.values.MANUAL,
            userId
        ));
    }

    protected _enqueue(topic: string, store: () => Promise<void>): void {
        this._queue = this._queue
            .then(store)
            .catch((error: Error) => {
                // One message that cannot be stored must not stop the next one,
                // nor take the server down.
                this._log(`Failed to store a message on "${topic}": ${error.message}`);
            });
    }

    /** Wait for every message handed over so far, and notify the clients now */
    public async flush(): Promise<void> {
        await this._queue;
        if (this._notifyTimer != null) {
            clearTimeout(this._notifyTimer);
            this._notifyTimer = null;
        }
        this._notify();
    }

    /** Stop notifying. The pending writes are still awaited by flush() */
    public async stop(): Promise<void> {
        await this.flush();
    }

    //#region Storing ---------------------------------------------------------

    protected async _store(message: BrokerMessage, receivedAt: number, source: MessageSource, sourceUserId: number | null): Promise<void> {
        const topicId = await this._getTopicId(message.topic);
        const { payload, payloadIsBase64 } = encodePayload(message.payload);

        await this._params.db.withTransaction(async (connection) => {
            await connection.run(
                `INSERT INTO "${MESSAGES}" ("topicId", "receivedAt", "payload", "payloadIsBase64", "retain", "qos", "source", "sourceUserId")
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                topicId, receivedAt, payload, payloadIsBase64, message.retain, message.qos, source, sourceUserId
            );
            await connection.run(
                `UPDATE "${TOPICS}" SET "lastMessageAt" = $1 WHERE "id" = $2`,
                receivedAt, topicId
            );
        });

        await this._prune(topicId);
        this._scheduleNotify({
            topicId: topicId as TopicId,
            topicName: message.topic as TopicName,
            payload,
            payloadIsBase64,
            receivedAt,
            retain: message.retain,
            qos: message.qos,
            source
        });
    }

    /** @returns the id of a topic, creating the row the first time it is seen */
    protected async _getTopicId(name: string): Promise<number> {
        const known = this._topicIds.get(name);
        if (known != null) {
            return known;
        }
        // The no-op update is what makes RETURNING give a row on conflict too,
        // so an existing topic costs one query rather than two.
        const row = await this._params.db.get<{ id: number }>(
            `INSERT INTO "${TOPICS}" ("name") VALUES ($1)
             ON CONFLICT ("name") DO UPDATE SET "name" = EXCLUDED."name"
             RETURNING "id"`,
            name
        );
        if (row == null) {
            throw new Error(`Could not resolve the topic "${name}"`);
        }
        this._topicIds.set(name, row.id);
        return row.id;
    }

    /** Drop what falls outside the retention of a topic */
    protected async _prune(topicId: number): Promise<void> {
        const keep = this._params.settings.get("history.messagesPerTopic");
        if (keep <= 0) {
            // Documented as "keep everything".
            return;
        }
        await this._params.db.run(
            `DELETE FROM "${MESSAGES}" WHERE "topicId" = $1 AND "id" NOT IN (
                SELECT "id" FROM "${MESSAGES}" WHERE "topicId" = $1 ORDER BY "receivedAt" DESC, "id" DESC LIMIT $2
            )`,
            topicId, keep
        );
    }

    //#endregion

    //#region Notifying -------------------------------------------------------

    protected _scheduleNotify(message: IngestedMessage): void {
        // Overwrites any earlier entry for the same topic in this batch —
        // only the latest matters for messagesIngested (see the field
        // comment on _pending).
        this._pending.set(message.topicId, message);
        if (this._notifyTimer != null) {
            return;
        }
        this._notifyTimer = setTimeout(() => {
            this._notifyTimer = null;
            this._notify();
        }, this._notifyDelayMs);
        this._notifyTimer.unref?.();
    }

    protected _notify(): void {
        if (this._pending.size === 0) {
            return;
        }
        const messages = [...this._pending.values()];
        // Only the contexts actually written. The topic list (and
        // lastMessages, ROADMAP tranche 4) also go stale, but that relation
        // is declared once in the context adapter rather than repeated by
        // every writer — see contexts.ts.
        const contexts: AppContexts[] = messages.map((message) => ({
            type: "topic",
            options: { topicId: message.topicId }
        }));
        this._pending.clear();
        this._params.broadcast(contexts);
        this._params.onMessagesIngested?.(messages);
    }

    //#endregion
}
