import { SettingsWriteService } from "@dagda/shared/src/settings/service";
import { connect, IClientOptions, MqttClient } from "mqtt";
import { AppSettings } from "@mqtt-toolbox/shared/src/settings";

/**
 * The connection to the MQTT broker (FEATURES §1).
 *
 * Transport only: it connects, subscribes, and hands over what arrives.
 * Persistence is the ingestor's job, so that a change in how messages are stored
 * never touches the connection logic, and so that either can be tested alone.
 *
 * The connection reconfigures itself when the settings change (FEATURES §1,
 * "reconnexion à chaud"), which is what the change notification of Dagda
 * FEATURES §11.5 exists for. Without it, changing the broker URL would mean a
 * restart.
 */

/** What a received message carries, before anything is stored */
export interface BrokerMessage {
    /** Full topic name, slashes included */
    topic: string;
    /** Raw bytes: MQTT payloads are arbitrary, the encoding is decided downstream */
    payload: Buffer;
    retain: boolean;
    qos: number;
}

/** State of the connection, as the status page displays it */
export interface BrokerState {
    connected: boolean;
    /** Reason of the last failure, when disconnected */
    error?: string;
}

/** The settings the connection reads. A change on any of them reconnects it. */
const WATCHED_SETTINGS = [
    "mqtt.url",
    "mqtt.clientId",
    "mqtt.topics",
    "mqtt.username",
    "mqtt.password",
    "mqtt.enabled"
] as const satisfies readonly (keyof AppSettings)[];

export interface BrokerConnectionParams {
    /** Where the configuration is read and watched */
    settings: SettingsWriteService<AppSettings>["settings"];
    /** Called for every message received on a subscribed topic */
    onMessage: (message: BrokerMessage) => void;
    /** Called whenever the connection state changes */
    onStateChanged: (state: BrokerState) => void;
    /**
     * How long to wait before acting on a settings change.
     *
     * Saving a form writes the settings one by one, so without this a six-field
     * form would reconnect six times, the first five to configurations that
     * never existed as a whole.
     */
    reconfigureDelayMs?: number;
    /** Where the connection reports what it does. Defaults to the console */
    log?: (message: string) => void;
}

export class BrokerConnection {

    protected readonly _params: BrokerConnectionParams;
    protected readonly _reconfigureDelayMs: number;
    protected readonly _log: (message: string) => void;

    protected _client: MqttClient | null = null;
    protected _state: BrokerState = { connected: false };
    /** Removes the settings listeners, set by start() */
    protected _unwatch: (() => void)[] = [];
    protected _reconfigureTimer: ReturnType<typeof setTimeout> | null = null;
    /** True once stop() ran, so a pending reconfiguration does not resurrect the client */
    protected _stopped: boolean = false;

    constructor(params: BrokerConnectionParams) {
        this._params = params;
        this._reconfigureDelayMs = params.reconfigureDelayMs ?? 250;
        this._log = params.log ?? ((message: string) => console.log(message));
    }

    /** State of the connection, for the status page */
    public get state(): BrokerState {
        return this._state;
    }

    /**
     * Publish a message (MQTTToolbox FEATURES §3).
     *
     * @throws if there is no live connection — a caller with something to
     * tell the user (a toast, ROADMAP tranche 2) is better placed to decide
     * how than this class is.
     */
    public publish(topic: string, payload: Buffer, options: { retain: boolean, qos: 0 | 1 | 2 }): Promise<void> {
        const client = this._client;
        if (client == null) {
            return Promise.reject(new Error("Not connected to the broker"));
        }
        return new Promise((resolve, reject) => {
            client.publish(topic, payload, options, (error) => {
                if (error != null) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    //#region Lifecycle -------------------------------------------------------

    /** Connect, and keep the connection in step with the settings */
    public start(): void {
        this._stopped = false;
        for (const key of WATCHED_SETTINGS) {
            this._unwatch.push(this._params.settings.on(key, () => this._scheduleReconfigure()));
        }
        this._connect();
    }

    /** Disconnect and stop watching the settings */
    public async stop(): Promise<void> {
        this._stopped = true;
        if (this._reconfigureTimer != null) {
            clearTimeout(this._reconfigureTimer);
            this._reconfigureTimer = null;
        }
        for (const off of this._unwatch) {
            off();
        }
        this._unwatch = [];
        await this._disconnect();
    }

    /** Coalesce the settings changes of one save into a single reconnection */
    protected _scheduleReconfigure(): void {
        if (this._reconfigureTimer != null) {
            clearTimeout(this._reconfigureTimer);
        }
        this._reconfigureTimer = setTimeout(() => {
            this._reconfigureTimer = null;
            if (this._stopped) {
                return;
            }
            this._log("Broker configuration changed, reconnecting...");
            void this._disconnect().then(() => this._connect());
        }, this._reconfigureDelayMs);
        // A reconnection must never be what keeps the process alive.
        this._reconfigureTimer.unref?.();
    }

    //#endregion

    //#region Connection ------------------------------------------------------

    protected _connect(): void {
        const settings = this._params.settings;

        if (!settings.get("mqtt.enabled")) {
            this._log("Broker connection disabled by the settings.");
            this._setState({ connected: false });
            return;
        }

        const url = settings.get("mqtt.url");
        const username = settings.get("mqtt.username");
        const options: IClientOptions = {
            clientId: settings.get("mqtt.clientId"),
            // The client reconnects on its own; the settings listener only deals
            // with a configuration that changed, not with a broker that blinked.
            reconnectPeriod: 5000,
            // Keeping the session across reconnections would have the broker
            // queue messages for a client that may be down for days.
            clean: true
        };
        if (username !== "") {
            options.username = username;
            options.password = settings.get("mqtt.password");
        }

        this._log(`Connecting to broker ${url}...`);
        const client = connect(url, options);
        this._client = client;

        client.on("connect", () => {
            this._setState({ connected: true });
            this._subscribe(client);
        });

        client.on("message", (topic: string, payload: Buffer, packet) => {
            this._params.onMessage({
                topic,
                payload,
                retain: packet.retain === true,
                qos: packet.qos ?? 0
            });
        });

        client.on("error", (error: Error) => {
            // Reported, not thrown: an unreachable broker is a state to display,
            // not a reason to take the server down.
            this._setState({ connected: false, error: error.message });
            this._log(`Broker error: ${error.message}`);
        });

        client.on("close", () => {
            if (this._state.connected) {
                this._setState({ connected: false, error: this._state.error });
            }
        });
    }

    /** Subscribe to the configured topics */
    protected _subscribe(client: MqttClient): void {
        const topics = this._getTopics();
        if (topics.length === 0) {
            this._log("No topic configured, nothing subscribed.");
            return;
        }
        client.subscribe(topics, { qos: 0 }, (error: Error | null) => {
            if (error != null) {
                this._setState({ connected: true, error: `subscription failed: ${error.message}` });
                this._log(`Failed to subscribe to ${topics.join(", ")}: ${error.message}`);
            } else {
                this._log(`Subscribed to ${topics.join(", ")}.`);
            }
        });
    }

    /** @returns the configured topics, empty entries dropped */
    protected _getTopics(): string[] {
        return this._params.settings.get("mqtt.topics")
            .split(",")
            .map((topic: string) => topic.trim())
            .filter((topic: string) => topic.length > 0);
    }

    protected async _disconnect(): Promise<void> {
        const client = this._client;
        this._client = null;
        if (client == null) {
            return;
        }
        // Force: a client waiting on an unreachable broker would otherwise hold
        // the reconnection back until its own timeout.
        await client.endAsync(true).catch(() => { /* already gone */ });
        this._setState({ connected: false });
    }

    protected _setState(state: BrokerState): void {
        if (this._state.connected === state.connected && this._state.error === state.error) {
            return;
        }
        this._state = state;
        this._params.onStateChanged(state);
    }

    //#endregion
}
