import { AbstractWebComponent, Attribute, WebComponentOptions } from "@dagda/client/src/components/abstract.webcomponent";
import { Dagda } from "@dagda/shared/src/dagda";
import { MqttService, MqttValue } from "../mqtt-api";

/**
 * Shared behaviour of the five dashboard components (Dagda ROADMAP tranche
 * 4, FEATURES §6.1): read `topic`, wait for `Dagda.get<MqttService>("mqtt")` to
 * have an initial value, re-render on every live update, unsubscribe on
 * disconnect.
 *
 * `topic` is read once, at connection — a dashboard's HTML is static
 * (authored once, not re-templated at runtime), so there is no case where
 * it changes under a live element, same posture the framework already takes
 * for every other attribute (none are observed for changes after connect).
 */
export abstract class AbstractMqttComponent extends AbstractWebComponent {

    @Attribute()
    protected _topic!: string | null;

    protected _unsubscribe: (() => void) | null = null;

    protected constructor(options?: WebComponentOptions) {
        super(options);
    }

    protected override async _init(): Promise<void> {
        const mqtt = Dagda.get<MqttService>("mqtt");
        await mqtt.ensureLoaded();
        if (this._topic != null) {
            this._unsubscribe = mqtt.on(this._topic, () => {
                this.refresh().catch((err: unknown) => console.error(`Error refreshing <${this.tagName.toLowerCase()}>`, err));
            });
        }
    }

    /** Native lifecycle hook, not AbstractWebComponent's own — see CodeEditor for the same idiom */
    public disconnectedCallback(): void {
        this._unsubscribe?.();
        this._unsubscribe = null;
    }

    /** The current payload of `topic` (parsed JSON when it reads as JSON), or undefined before it's known or without a topic */
    protected _value(): unknown {
        return this._topic == null ? undefined : Dagda.get<MqttService>("mqtt").get(this._topic);
    }

    /** The full record — `receivedAt` included — for the components that need more than the plain value */
    protected _record(): MqttValue | undefined {
        return this._topic == null ? undefined : Dagda.get<MqttService>("mqtt").getValue(this._topic);
    }

}
