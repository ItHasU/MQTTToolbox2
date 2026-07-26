import { Attribute } from "@dagda/client/src/components/abstract.webcomponent";
import { AbstractMqttComponent } from "./base";

/** `<mqtt-date topic="…" format="…">` — the date of a topic's last message (Dagda ROADMAP tranche 4, FEATURES §6.1) */
export class MqttDateElement extends AbstractMqttComponent {

    /** `"iso"`, `"date"`, `"time"`, or absent for the locale's full date and time */
    @Attribute()
    protected _format!: string | null;

    constructor() {
        super();
    }

    protected override async _refresh(): Promise<void> {
        const record = this._record();
        if (record == null) {
            this.textContent = "";
            return;
        }
        const date = new Date(record.receivedAt);
        switch (this._format) {
            case "iso":
                this.textContent = date.toISOString();
                break;
            case "date":
                this.textContent = date.toLocaleDateString();
                break;
            case "time":
                this.textContent = date.toLocaleTimeString();
                break;
            default:
                this.textContent = date.toLocaleString();
        }
    }

}
customElements.define("mqtt-date", MqttDateElement);
