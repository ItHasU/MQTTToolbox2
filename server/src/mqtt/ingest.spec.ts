import { SettingsModel } from "@dagda/shared/src/settings/model";
import { SettingsStore } from "@dagda/server/src/settings/store";
import { FRAMEWORK_MIGRATIONS } from "@dagda/server/src/sql/framework.migrations";
import { applyMigrations } from "@dagda/server/src/sql/migrations";
import { createTestDatabase, TestDatabase } from "@dagda/server/src/test/pg.fixture";
import { AppContexts } from "@mqtt-toolbox/shared/src/entities/contexts";
import { APP_MODEL, MESSAGE_SOURCE } from "@mqtt-toolbox/shared/src/entities/model";
import { APP_SETTINGS, AppSettings } from "@mqtt-toolbox/shared/src/settings";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { APP_MIGRATIONS } from "../migrations";
import { BrokerMessage } from "./broker";
import { encodePayload, MessageIngestor } from "./ingest";

const available = inject("databaseAvailable");

const TOPICS = APP_MODEL.getTableSqlName("topics");
const MESSAGES = APP_MODEL.getTableSqlName("messages");

/** A received message, with the fields a test does not care about filled in */
function message(topic: string, payload: string | Buffer, overrides: Partial<BrokerMessage> = {}): BrokerMessage {
    return {
        topic,
        payload: typeof payload === "string" ? Buffer.from(payload, "utf8") : payload,
        retain: false,
        qos: 0,
        ...overrides
    };
}

describe("Payload encoding", () => {

    it("stores text as text, so the column stays readable in SQL", () => {
        expect(encodePayload(Buffer.from("21.5", "utf8")))
            .toEqual({ payload: "21.5", payloadIsBase64: false });
        expect(encodePayload(Buffer.from('{"temp":21.5}', "utf8")))
            .toEqual({ payload: '{"temp":21.5}', payloadIsBase64: false });
    });

    it("keeps accented text as text", () => {
        expect(encodePayload(Buffer.from("température élevée", "utf8")))
            .toEqual({ payload: "température élevée", payloadIsBase64: false });
    });

    it("stores an empty payload as empty text", () => {
        // A zero-length payload is how MQTT deletes a retained message; it is
        // not binary and must not become base64 noise.
        expect(encodePayload(Buffer.alloc(0)))
            .toEqual({ payload: "", payloadIsBase64: false });
    });

    it("falls back to base64 on bytes that are not UTF-8", () => {
        const binary = Buffer.from([0xff, 0xfe, 0x01, 0x02]);
        expect(encodePayload(binary))
            .toEqual({ payload: binary.toString("base64"), payloadIsBase64: true });
    });

    it("falls back to base64 on a NUL byte, which PostgreSQL refuses in text", () => {
        // Valid UTF-8, but a text column cannot hold it.
        const withNul = Buffer.from([0x61, 0x00, 0x62]);
        expect(encodePayload(withNul))
            .toEqual({ payload: withNul.toString("base64"), payloadIsBase64: true });
    });

    it("gives back the exact bytes it encoded", () => {
        const binary = Buffer.from([0x00, 0xff, 0x80, 0x7f]);
        const encoded = encodePayload(binary);
        expect(Buffer.from(encoded.payload, "base64")).toEqual(binary);
    });

});

describe.runIf(available)("Message ingestion", () => {

    let db: TestDatabase;
    let settings: SettingsStore<AppSettings>;
    let broadcasts: AppContexts[][];
    let logged: string[];

    async function createIngestor(): Promise<MessageIngestor> {
        return new MessageIngestor({
            db: db.runner,
            settings: settings.settings,
            broadcast: (contexts) => broadcasts.push(contexts),
            // Long enough never to fire on its own: flush() is what notifies,
            // so the assertions never race the clock. A short delay would make
            // the batching tests depend on how fast the database answered.
            notifyDelayMs: 60_000,
            log: (m: string) => logged.push(m)
        });
    }

    beforeEach(async () => {
        db = await createTestDatabase("ingest");
        broadcasts = [];
        logged = [];
        await applyMigrations(db.runner, APP_MODEL, FRAMEWORK_MIGRATIONS, "framework");
        await applyMigrations(db.runner, APP_MODEL, APP_MIGRATIONS, "app");

        settings = new SettingsStore<AppSettings>({
            model: APP_SETTINGS,
            runner: db.runner,
            // The declaration holds a secret, so a key is mandatory.
            encryptionKey: "z8Vq2mR6tYuI0pAsDfGhJkLxCvBnM3wQeRtYuIoP1a0=",
            env: {},
            log: (m: string) => logged.push(m)
        });
        await settings.load();
    });

    afterEach(async () => {
        await db?.dispose();
    });

    describe("Storing a message", () => {

        it("creates the topic the first time it is seen", async () => {
            const ingestor = await createIngestor();
            ingestor.ingest(message("home/kitchen/temp", "21.5"));
            await ingestor.flush();

            const topics = await db.runner.all<{ name: string }>(`SELECT "name" FROM "${TOPICS}"`);
            expect(topics.map(t => t.name)).toEqual(["home/kitchen/temp"]);
        });

        it("stores the message with everything the broker said", async () => {
            const ingestor = await createIngestor();
            ingestor.ingest(message("home/kitchen/temp", "21.5", { retain: true, qos: 2 }), 1700000000000);
            await ingestor.flush();

            const row = await db.runner.get<{
                payload: string, payloadIsBase64: boolean, retain: boolean,
                qos: number, source: number, receivedAt: string
            }>(`SELECT * FROM "${MESSAGES}"`);
            expect(row?.payload).toBe("21.5");
            expect(row?.payloadIsBase64).toBe(false);
            expect(row?.retain).toBe(true);
            expect(row?.qos).toBe(2);
            expect(Number(row?.receivedAt)).toBe(1700000000000);
            // Received from the broker, not published by a user or an automation.
            expect(row?.source).toBe(MESSAGE_SOURCE.values.EXTERNAL);
        });

        it("reuses the topic on the next message", async () => {
            const ingestor = await createIngestor();
            ingestor.ingest(message("home/kitchen/temp", "21.5"));
            ingestor.ingest(message("home/kitchen/temp", "21.6"));
            await ingestor.flush();

            const topics = await db.runner.all(`SELECT "id" FROM "${TOPICS}"`);
            expect(topics).toHaveLength(1);
            const messages = await db.runner.all(`SELECT "id" FROM "${MESSAGES}"`);
            expect(messages).toHaveLength(2);
        });

        it("creates one topic only, when two messages race on a new topic", async () => {
            // Two messages handed over before the first write finished. Without
            // the write queue both would insert, and the unique index would turn
            // a normal burst into a lost message.
            const ingestor = await createIngestor();
            ingestor.ingest(message("home/new", "a"));
            ingestor.ingest(message("home/new", "b"));
            ingestor.ingest(message("home/new", "c"));
            await ingestor.flush();

            expect(await db.runner.all(`SELECT "id" FROM "${TOPICS}"`)).toHaveLength(1);
            expect(await db.runner.all(`SELECT "id" FROM "${MESSAGES}"`)).toHaveLength(3);
            expect(logged).toEqual([]);
        });

        it("keeps a topic used by a previous run", async () => {
            const first = await createIngestor();
            first.ingest(message("home/kitchen/temp", "21.5"));
            await first.flush();

            // A fresh ingestor has an empty name-to-id cache, as after a restart.
            const second = await createIngestor();
            second.ingest(message("home/kitchen/temp", "21.6"));
            await second.flush();

            expect(await db.runner.all(`SELECT "id" FROM "${TOPICS}"`)).toHaveLength(1);
            expect(await db.runner.all(`SELECT "id" FROM "${MESSAGES}"`)).toHaveLength(2);
        });

        it("stores a binary payload as base64", async () => {
            const ingestor = await createIngestor();
            const binary = Buffer.from([0xff, 0x00, 0x80]);
            ingestor.ingest(message("home/sensor/raw", binary));
            await ingestor.flush();

            const row = await db.runner.get<{ payload: string, payloadIsBase64: boolean }>(`SELECT * FROM "${MESSAGES}"`);
            expect(row?.payloadIsBase64).toBe(true);
            expect(Buffer.from(row!.payload, "base64")).toEqual(binary);
        });

        it("records when a topic last spoke", async () => {
            const ingestor = await createIngestor();
            ingestor.ingest(message("home/kitchen/temp", "21.5"), 1700000000000);
            ingestor.ingest(message("home/kitchen/temp", "21.6"), 1700000005000);
            await ingestor.flush();

            const topic = await db.runner.get<{ lastMessageAt: string }>(`SELECT "lastMessageAt" FROM "${TOPICS}"`);
            expect(Number(topic?.lastMessageAt)).toBe(1700000005000);
        });

        it("keeps going after a message it cannot store", async () => {
            const ingestor = await createIngestor();
            // Longer than any topic a broker would send, and longer than the
            // unique index can hold — a real failure, not a contrived one.
            ingestor.ingest(message("x".repeat(3000), "a"));
            ingestor.ingest(message("home/kitchen/temp", "21.5"));
            await ingestor.flush();

            const rows = await db.runner.all<{ name: string }>(`SELECT "name" FROM "${TOPICS}"`);
            expect(rows.map(r => r.name)).toContain("home/kitchen/temp");
        });

    });

    describe("Retention", () => {

        it("keeps only the configured number of messages per topic", async () => {
            await settings.set("history.messagesPerTopic", 3);
            const ingestor = await createIngestor();
            for (let i = 0; i < 10; i++) {
                ingestor.ingest(message("home/kitchen/temp", String(i)), 1700000000000 + i * 1000);
            }
            await ingestor.flush();

            const rows = await db.runner.all<{ payload: string }>(
                `SELECT "payload" FROM "${MESSAGES}" ORDER BY "receivedAt" DESC`
            );
            expect(rows.map(r => r.payload)).toEqual(["9", "8", "7"]);
        });

        it("counts per topic, not across all of them", async () => {
            await settings.set("history.messagesPerTopic", 2);
            const ingestor = await createIngestor();
            for (let i = 0; i < 4; i++) {
                ingestor.ingest(message("home/a", `a${i}`), 1700000000000 + i * 1000);
                ingestor.ingest(message("home/b", `b${i}`), 1700000000000 + i * 1000);
            }
            await ingestor.flush();

            const rows = await db.runner.all<{ payload: string }>(`SELECT "payload" FROM "${MESSAGES}"`);
            expect(rows).toHaveLength(4);
            expect(rows.map(r => r.payload).sort()).toEqual(["a2", "a3", "b2", "b3"]);
        });

        it("keeps everything when the retention is zero", async () => {
            await settings.set("history.messagesPerTopic", 0);
            const ingestor = await createIngestor();
            for (let i = 0; i < 5; i++) {
                ingestor.ingest(message("home/kitchen/temp", String(i)), 1700000000000 + i * 1000);
            }
            await ingestor.flush();

            expect(await db.runner.all(`SELECT "id" FROM "${MESSAGES}"`)).toHaveLength(5);
        });

        it("follows the setting when it changes, without a restart", async () => {
            const ingestor = await createIngestor();
            for (let i = 0; i < 5; i++) {
                ingestor.ingest(message("home/kitchen/temp", String(i)), 1700000000000 + i * 1000);
            }
            await ingestor.flush();
            expect(await db.runner.all(`SELECT "id" FROM "${MESSAGES}"`)).toHaveLength(5);

            // The ingestor reads the setting on every message rather than
            // holding a copy, so tightening it applies from the next one.
            await settings.set("history.messagesPerTopic", 2);
            ingestor.ingest(message("home/kitchen/temp", "5"), 1700000005000);
            await ingestor.flush();
            expect(await db.runner.all(`SELECT "id" FROM "${MESSAGES}"`)).toHaveLength(2);
        });

    });

    describe("Recording a manual publish (ROADMAP tranche 2)", () => {

        it("creates the topic the first time it is published to", async () => {
            const ingestor = await createIngestor();
            ingestor.recordManualPublish("home/lamp", Buffer.from("on"), { retain: false, qos: 0 }, 7);
            await ingestor.flush();

            const topics = await db.runner.all<{ name: string }>(`SELECT "name" FROM "${TOPICS}"`);
            expect(topics.map(t => t.name)).toEqual(["home/lamp"]);
        });

        it("stores it as manual, attributed to whoever sent it", async () => {
            const ingestor = await createIngestor();
            ingestor.recordManualPublish("home/lamp", Buffer.from("on"), { retain: true, qos: 1 }, 7);
            await ingestor.flush();

            const row = await db.runner.get<{ source: number, sourceUserId: number, retain: boolean, qos: number, payload: string }>(
                `SELECT * FROM "${MESSAGES}"`
            );
            expect(row?.source).toBe(MESSAGE_SOURCE.values.MANUAL);
            expect(row?.sourceUserId).toBe(7);
            expect(row?.retain).toBe(true);
            expect(row?.qos).toBe(1);
            expect(row?.payload).toBe("on");
        });

        it("is a second, independent row from the broker's own echo of the same message", async () => {
            // The whole point (per Matthieu): one row for "we handed it to the
            // broker", a second, separate one for "the broker actually
            // processed it" — comparing the two is the feature, so recording
            // only one on purpose would defeat it.
            const ingestor = await createIngestor();
            ingestor.recordManualPublish("home/lamp", Buffer.from("on"), { retain: false, qos: 0 }, 7);
            ingestor.ingest(message("home/lamp", "on"));
            await ingestor.flush();

            const rows = await db.runner.all<{ source: number }>(`SELECT "source" FROM "${MESSAGES}"`);
            expect(rows).toHaveLength(2);
            expect(rows.map(r => r.source).sort()).toEqual(
                [MESSAGE_SOURCE.values.EXTERNAL, MESSAGE_SOURCE.values.MANUAL].sort()
            );
        });

        it("counts against the same retention as any other message", async () => {
            await settings.set("history.messagesPerTopic", 1);
            const ingestor = await createIngestor();
            ingestor.recordManualPublish("home/lamp", Buffer.from("on"), { retain: false, qos: 0 }, 7);
            ingestor.ingest(message("home/lamp", "on"));
            await ingestor.flush();

            expect(await db.runner.all(`SELECT "id" FROM "${MESSAGES}"`)).toHaveLength(1);
        });

        it("broadcasts the topic, same as a received message", async () => {
            const ingestor = await createIngestor();
            ingestor.recordManualPublish("home/lamp", Buffer.from("on"), { retain: false, qos: 0 }, 7);
            await ingestor.flush();

            const topic = await db.runner.get<{ id: number }>(`SELECT "id" FROM "${TOPICS}"`);
            expect(broadcasts).toEqual([[{ type: "topic", options: { topicId: topic!.id } }]]);
        });

    });

    describe("Telling the clients", () => {

        it("broadcasts the context of the topic that changed", async () => {
            const ingestor = await createIngestor();
            ingestor.ingest(message("home/kitchen/temp", "21.5"));
            await ingestor.flush();

            const topic = await db.runner.get<{ id: number }>(`SELECT "id" FROM "${TOPICS}"`);
            expect(broadcasts).toEqual([[{ type: "topic", options: { topicId: topic!.id } }]]);
        });

        it("does not broadcast the topic list", async () => {
            // The list does go stale — it carries lastMessageAt — but that
            // relation is declared once in the context adapter. A writer only
            // ever announces what it wrote (see contexts.ts).
            const ingestor = await createIngestor();
            ingestor.ingest(message("home/kitchen/temp", "21.5"));
            await ingestor.flush();

            expect(broadcasts.flat().map(c => c.type)).not.toContain("topics");
        });

        it("says nothing when nothing arrived", async () => {
            const ingestor = await createIngestor();
            await ingestor.flush();
            expect(broadcasts).toEqual([]);
        });

        it("groups a burst into a single broadcast", async () => {
            // One notification per message would be a firehose on a busy broker,
            // and every client would refetch on each one.
            const ingestor = await createIngestor();
            for (let i = 0; i < 20; i++) {
                ingestor.ingest(message("home/kitchen/temp", String(i)));
            }
            await ingestor.flush();

            expect(broadcasts).toHaveLength(1);
            expect(broadcasts[0]).toHaveLength(1);
        });

        it("notifies on its own, without anyone calling flush", async () => {
            // Every other test here drives the notification through flush(), so
            // without this one the timer could be dead and nothing would say so
            // — and a running server never calls flush().
            const ingestor = new MessageIngestor({
                db: db.runner,
                settings: settings.settings,
                broadcast: (contexts) => broadcasts.push(contexts),
                notifyDelayMs: 20,
                log: (m: string) => logged.push(m)
            });
            ingestor.ingest(message("home/kitchen/temp", "21.5"));

            await expect.poll(() => broadcasts.length, { timeout: 2000 }).toBe(1);
            expect(broadcasts[0]?.[0]?.type).toBe("topic");
        });

        it("names every topic of a burst, exactly once", async () => {
            const ingestor = await createIngestor();
            ingestor.ingest(message("home/a", "1"));
            ingestor.ingest(message("home/b", "2"));
            ingestor.ingest(message("home/a", "3"));
            await ingestor.flush();

            expect(broadcasts).toHaveLength(1);
            expect(broadcasts[0]).toHaveLength(2);
        });

    });

});
