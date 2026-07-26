import { actionCall } from "@dagda/client/src/actions";
import { Dagda } from "@dagda/shared/src/dagda";
import { EntitiesService } from "@dagda/shared/src/entities/service";
import { NotificationService } from "@dagda/shared/src/notification/service";
import { EventListener } from "@dagda/shared/src/tools/events";
import { AppActions, ScheduledPublish } from "@mqtt-toolbox/shared/src/actions";
import { AppContexts } from "@mqtt-toolbox/shared/src/entities/contexts";
import { IngestedMessage } from "@mqtt-toolbox/shared/src/entities/events";
import { AppEntityTypes } from "@mqtt-toolbox/shared/src/entities/types";
import { AppNotifications } from "@mqtt-toolbox/shared/src/services";

/** The current value of a topic, as `MQTT.get`/`getAll`/`on` (FEATURES §6.2) hand it over */
export interface MqttValue {
    topic: string;
    /** `JSON.parse`d when the payload reads as JSON, the raw string otherwise */
    payload: unknown;
    /** The payload exactly as received, always a string — base64 for a binary message */
    raw: string;
    payloadIsBase64: boolean;
    receivedAt: number;
}

function toValue(topic: string, message: { payload: string, payloadIsBase64: boolean, receivedAt: number }): MqttValue {
    let payload: unknown = message.payload;
    if (!message.payloadIsBase64) {
        try {
            payload = JSON.parse(message.payload);
        } catch {
            // Not JSON — the raw string is the value, same as v1.
        }
    }
    return { topic, payload, raw: message.payload, payloadIsBase64: message.payloadIsBase64, receivedAt: message.receivedAt };
}

/** What `Dagda.get<MqttService>("mqtt")` exposes */
export interface MqttService {
    mqtt: MqttApi;
}

/**
 * The dashboard's JavaScript API (Dagda ROADMAP tranche 4, FEATURES §6.2) —
 * `window.MQTT` in v1, `Dagda.get<MqttService>("mqtt")` here, aliased to
 * `window.MQTT` only while a dashboard's own HTML/JS is what's running (the
 * dashboard page does that, not this class — this class has no opinion
 * about *where* it's exposed, only about what it does).
 *
 * Kept deliberately close to the future automation API (§5.3) in names and
 * signatures — same mental model for the user, the only difference being
 * where it runs: `MQTT.trigger(name)` (triggering an automation from a
 * dashboard) is a documented gap here, not implemented, since automations
 * don't exist until tranche 6.
 */
export class MqttApi {

    protected _values = new Map<string, MqttValue>();
    protected _listeners = new Map<string, Set<(value: MqttValue) => void>>();
    protected _loaded: Promise<void> | null = null;

    /**
     * Fetches every topic's last value and subscribes to live updates.
     * Idempotent — safe to call every time a dashboard opens, only the
     * first call does any work.
     */
    public ensureLoaded(): Promise<void> {
        this._loaded ??= this._load();
        return this._loaded;
    }

    protected async _load(): Promise<void> {
        const entities = Dagda.get<EntitiesService<AppEntityTypes, AppContexts>>("entities");
        await entities.getHandler().fetch({ type: "lastMessages", options: undefined });

        const handler = entities.getHandler();
        for (const message of handler.getItems("messages")) {
            const topic = handler.getById("topics", message.topicId)?.name;
            if (topic != null) {
                this._values.set(topic, toValue(topic, message));
            }
        }

        const listener: EventListener<IngestedMessage[]> = (event) => {
            for (const message of event.data) {
                const value = toValue(message.topicName, message);
                this._values.set(message.topicName, value);
                for (const callback of this._listeners.get(message.topicName) ?? []) {
                    callback(value);
                }
            }
        };
        Dagda.get<NotificationService<AppNotifications>>("notification").on("messagesIngested", listener);
    }

    /** The current value of a topic, or undefined if it has never been seen */
    public get(topic: string): unknown {
        return this._values.get(topic)?.payload;
    }

    /** The full record (payload, raw, receivedAt) — what `<mqtt-date>`/`<mqtt-age>` need beyond the plain value `get()` hands the dashboard's own JS */
    public getValue(topic: string): MqttValue | undefined {
        return this._values.get(topic);
    }

    /** Every known topic's current value, keyed by topic name */
    public getAll(): Record<string, unknown> {
        const result: Record<string, unknown> = {};
        for (const [topic, value] of this._values) {
            result[topic] = value.payload;
        }
        return result;
    }

    /** Every known topic name */
    public list(): string[] {
        return [...this._values.keys()];
    }

    /** Subscribes to every future value on `topic`. @returns a function that unsubscribes */
    public on(topic: string, callback: (value: unknown) => void): () => void {
        let set = this._listeners.get(topic);
        if (set == null) {
            set = new Set();
            this._listeners.set(topic, set);
        }
        const wrapped = (value: MqttValue): void => callback(value.payload);
        set.add(wrapped);
        return () => set.delete(wrapped);
    }

    /**
     * Publishes a message. `payload` a string is sent as-is; an object is
     * `JSON.stringify`'d first — binary is not yet supported (the
     * `publishMessage` action itself is text-only for now, FEATURES §3).
     */
    public async publish(topic: string, payload: string | Record<string, unknown>, options?: { retain?: boolean, qos?: 0 | 1 | 2 }): Promise<void> {
        const text = typeof payload === "string" ? payload : JSON.stringify(payload);
        await actionCall<AppActions, "publishMessage">("publishMessage", {
            topic,
            payload: text,
            retain: options?.retain,
            qos: options?.qos
        });
    }

    /** Every publish still waiting to fire (FEATURES §3) */
    public async getScheduled(): Promise<ScheduledPublish[]> {
        return actionCall<AppActions, "listScheduledPublishes">("listScheduledPublishes");
    }

    /** Cancels a scheduled publish before it fires */
    public async cancelScheduled(id: number): Promise<void> {
        await actionCall<AppActions, "cancelScheduledPublish">("cancelScheduledPublish", { id });
    }

}
