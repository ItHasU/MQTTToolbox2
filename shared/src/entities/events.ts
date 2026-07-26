import { ScheduledPublish } from "../actions";

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
}
