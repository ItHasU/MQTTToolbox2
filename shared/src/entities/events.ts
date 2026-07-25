/** Application events pushed from the server to the clients (FEATURES §9) */
export type AppEvents = {
    /** State of the connection to the MQTT broker (FEATURES §1) */
    brokerStateChanged: {
        connected: boolean;
        /** Reason of the last failure, when disconnected */
        error?: string;
    };
}
