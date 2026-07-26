import { ScheduledPublish } from "../actions";
import { MessageSource } from "./model";
import { TopicId, TopicName } from "./types";

/**
 * One message as it was just ingested — the shape `messagesIngested` below
 * carries, and what the dashboard JS API's `MQTT.on(topic, callback)`
 * (ROADMAP tranche 4, FEATURES §6.2) delivers to a subscriber. Deliberately
 * not `MessageEntity`: this is a push notification, not an entity row (no
 * `id` — the row may already have been pruned by the time a slow client
 * gets around to reading it), and it carries the topic's name, which a
 * dashboard component addresses a topic by, not its numeric id.
 */
export interface IngestedMessage {
    topicId: TopicId;
    topicName: TopicName;
    payload: string;
    payloadIsBase64: boolean;
    receivedAt: number;
    retain: boolean;
    qos: number;
    source: MessageSource;
}

/** Application events pushed from the server to the clients (FEATURES §9) */
export type AppEvents = {
    /** State of the connection to the MQTT broker (FEATURES §1) */
    brokerStateChanged: {
        connected: boolean;
        /** Reason of the last failure, when disconnected */
        error?: string;
    };
    /**
     * The full, current list of pending scheduled publishes (FEATURES §3).
     *
     * The whole list rather than a delta: it is small (a handful of pending
     * messages at most) and this keeps the client's state a plain assignment
     * instead of a merge that can drift from the server's.
     */
    scheduledPublishesChanged: ScheduledPublish[];
    /**
     * One batch of newly-ingested messages (Dagda ROADMAP tranche 4) — the
     * same batching `MessageIngestor` already does for `contextChanged`
     * (`ingest.ts`), reused here rather than a second, uncoordinated timer:
     * a broadcast per message would be a firehose on a busy broker just as
     * much for this event as for that one.
     */
    messagesIngested: IngestedMessage[];
}
