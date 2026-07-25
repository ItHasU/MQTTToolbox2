import { Migration } from "@dagda/server/src/sql/migrations";

/**
 * Schema history of the application.
 *
 * Versioned migrations are the only way the schema evolves (Dagda FEATURES §2):
 * there is no synchronisation from the model, because a renamed field would read
 * as a drop followed by a create — a silent data loss.
 *
 * Two rules for whoever adds one:
 * - an id is recorded once applied, so it is never renamed and never inserted
 *   before an already released one;
 * - `createTable` / `createAllTables` read the model, so they only help on a
 *   table the model declares. Anything else is written by hand.
 */
export const APP_MIGRATIONS: Migration[] = [
    {
        id: "0001-initial-schema",
        up: async (tools) => {
            await tools.createAllTables();
        }
    },
    {
        id: "0002-topic-name-unique",
        up: async (tools) => {
            // One row per topic: the ingestion looks a topic up by name on every
            // message, and a duplicate would split its history in two.
            await tools.run(`CREATE UNIQUE INDEX "data_topics_name" ON "data_topics" ("name")`);
        }
    },
    {
        id: "0003-messages-by-topic-and-date",
        up: async (tools) => {
            // The status page and the history of a topic both read this way.
            await tools.run(`CREATE INDEX "data_messages_topic_date" ON "data_messages" ("topicId", "receivedAt" DESC)`);
        }
    }
];
