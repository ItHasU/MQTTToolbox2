import { USERS_TABLE } from "@dagda/server/src/auth/users";
import { Migration } from "@dagda/server/src/sql/migrations";
import { qi } from "@dagda/server/src/sql/schema";

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
    },
    {
        id: "0004-source-user-fk",
        up: async (tools) => {
            // sourceUserId was a plain INTEGER (Dagda's model could not yet point
            // a field at system_users). The column and its data are untouched;
            // this only adds the constraint the model now declares (referencesUsers).
            // ON DELETE SET NULL, like system_users.roleId -> system_roles.id: a
            // deleted account must not turn a message into an orphaned row, it
            // should just lose its attribution.
            //
            // Guarded rather than a bare ADD CONSTRAINT: on an install that never
            // ran this migration the column has no constraint yet, but on a fresh
            // one 0001-initial-schema just created it already, since it builds the
            // table from the model as it stands today — which now includes this FK.
            // Postgres names an inline REFERENCES this way by default, so the two
            // paths land on the same name.
            await tools.run(
                `DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'data_messages_sourceUserId_fkey'
                    ) THEN
                        ALTER TABLE "data_messages"
                        ADD CONSTRAINT "data_messages_sourceUserId_fkey"
                        FOREIGN KEY (${qi("sourceUserId")}) REFERENCES ${qi(USERS_TABLE)}(${qi("id")}) ON DELETE SET NULL;
                    END IF;
                END $$`
            );
        }
    }
];
