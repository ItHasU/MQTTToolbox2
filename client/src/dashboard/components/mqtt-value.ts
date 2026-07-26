import { AbstractMqttComponent } from "./base";

/** `<mqtt-value topic="…">` — the raw payload of a topic's last message (Dagda ROADMAP tranche 4, FEATURES §6.1) */
export class MqttValueElement extends AbstractMqttComponent {

    constructor() {
        super();
    }

    protected override async _refresh(): Promise<void> {
        const value = this._value();
        this.textContent = value == null ? "" : (typeof value === "string" ? value : JSON.stringify(value));
    }

}
customElements.define("mqtt-value", MqttValueElement);
