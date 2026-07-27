import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { JSTypes } from "@dagda/shared/src/entities/tools/javascript.types";

//#region Custom field types --------------------------------------------------

/**
 * Where a message comes from (FEATURES §2).
 *
 * The stored values are explicit and must never be renumbered: they are what
 * ends up in the database. The labels are what the status page and the form
 * generator display, so no screen has to carry its own lookup table.
 */
export const MESSAGE_SOURCE = EntitiesModel.enum({
    /** Received from the broker */
    EXTERNAL: { value: 1, label: "Externe" },
    /** Published by a cron scenario or an automation */
    AUTOMATION: { value: 2, label: "Automatisme" },
    /** Published by a user from the dashboard */
    MANUAL: { value: 3, label: "Manuel" },
});

/** Union of the values a message source can take */
export type MessageSource = typeof MESSAGE_SOURCE.type;

//#endregion

//#region Entities model ------------------------------------------------------

export const APP_MODEL = new EntitiesModel({
    // -- ID types ------------------------------------------------------------
    USER_ID: {
        rawType: JSTypes.number
    },
    TOPIC_ID: {
        rawType: JSTypes.number
    },
    MESSAGE_ID: {
        rawType: JSTypes.number
    },
    DASHBOARD_ID: {
        rawType: JSTypes.number
    },
    SHARE_ID: {
        rawType: JSTypes.number
    },
    // -- Base types ----------------------------------------------------------
    BOOLEAN: {
        rawType: JSTypes.boolean
    },
    INTEGER: {
        rawType: JSTypes.number
    },
    TEXT: {
        rawType: JSTypes.string
    },
    /** Milliseconds since the epoch */
    TIMESTAMP: {
        rawType: JSTypes.number
    },
    // -- Custom types --------------------------------------------------------
    /** Full topic name, slashes included */
    TOPIC_NAME: {
        rawType: JSTypes.string
    },
    // The enumeration declared above is itself a field type definition,
    // so the same constant declares the values and types the column.
    MESSAGE_SOURCE: MESSAGE_SOURCE,
}, {
    /**
     * One row per topic ever seen.
     *
     * Topics are their own table rather than a column on the messages, because
     * the status page lists topics whether or not they still hold a message,
     * and because the retention policy (FEATURES §2) deletes messages without
     * losing the topic tree.
     */
    topics: {
        id: { type: "TOPIC_ID", identity: true },
        name: { type: "TOPIC_NAME" },
        /** When a message was last received on this topic, for sorting */
        lastMessageAt: { type: "TIMESTAMP", optional: true },
    },

    /**
     * Every message, not only the last one per topic (FEATURES §2).
     *
     * Payload encoding: MQTT payloads are arbitrary bytes, but in practice
     * almost all of them are UTF-8 text. Valid UTF-8 is stored as-is, which
     * keeps the column readable and searchable in SQL; anything else is stored
     * base64 with `payloadIsBase64` set. This replaces the v1
     * `{type:"Buffer", data:[…]}` encoding (FEATURES §9).
     */
    messages: {
        id: { type: "MESSAGE_ID", identity: true },
        topicId: { type: "TOPIC_ID", foreignTable: "topics" },
        receivedAt: { type: "TIMESTAMP" },
        payload: { type: "TEXT" },
        payloadIsBase64: { type: "BOOLEAN" },
        /** MQTT retain flag, as received or as published */
        retain: { type: "BOOLEAN" },
        /** MQTT quality of service, 0 to 2 */
        qos: { type: "INTEGER" },
        source: { type: "MESSAGE_SOURCE" },
        /** Set when source is MANUAL: who published it (FEATURES §12) */
        sourceUserId: { type: "USER_ID", optional: true, referencesUsers: true },
    },

    /**
     * A dashboard: free-form HTML the owner authored, plus the web components
     * of FEATURES §6.1 typed directly into it (Dagda ROADMAP tranche 4).
     *
     * `ownerId` is declared `referencesUsers: true` for the column type it
     * buys (a real `INTEGER` matching `system_users.id` — a plain `USER_ID`
     * field with neither marker stores as `DOUBLE PRECISION`, which Postgres
     * refuses to use in a foreign key against an integer primary key). The
     * `ON DELETE SET NULL` that marker also implies is wrong here — a
     * dashboard's owner is mandatory (`NOT NULL`), so losing the account
     * would fail the delete outright rather than orphan the row — so the
     * migration overrides the constraint to `ON DELETE CASCADE` by hand (a
     * dashboard has no meaning once its owner is gone, same call as
     * `system_preferences.userId`).
     */
    dashboards: {
        id: { type: "DASHBOARD_ID", identity: true },
        ownerId: { type: "USER_ID", referencesUsers: true },
        name: { type: "TEXT" },
        html: { type: "TEXT" },
        /** Position in the owner's swipeable list */
        sortOrder: { type: "INTEGER" },
        /**
         * Owner-settable (review feedback, superseding the original
         * per-user "share with" model): a public dashboard is visible to
         * every account, which may then independently import it
         * (`dashboard_shares`) into its own list. Flipping this back to
         * false is a live gate, not a one-time grant — an account that had
         * already imported it loses access the moment this reads false
         * again, re-checked on every fetch rather than only at import time.
         */
        isPublic: { type: "BOOLEAN" },
    },

    /**
     * Which accounts have imported a public dashboard into their own list
     * (Dagda ROADMAP tranche 4, reworked per review feedback from "owner
     * shares with a specific user" to "owner publishes, everyone else opts
     * in"). A synthetic `id`, not a composite `(dashboardId, userId)`
     * primary key: the entities machinery assumes exactly one numeric
     * identity column per table. The migration adds the
     * `UNIQUE(dashboardId, userId)` constraint the composite key would
     * otherwise have given for free, and overrides both foreign keys to
     * `ON DELETE CASCADE` by hand, for the same reason as
     * `dashboards.ownerId` above — an import row means nothing once either
     * side of it is gone.
     */
    dashboard_shares: {
        id: { type: "SHARE_ID", identity: true },
        dashboardId: { type: "DASHBOARD_ID", foreignTable: "dashboards" },
        userId: { type: "USER_ID", referencesUsers: true },
    }
});

//#endregion
