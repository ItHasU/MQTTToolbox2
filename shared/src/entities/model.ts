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
    }
});

//#endregion
