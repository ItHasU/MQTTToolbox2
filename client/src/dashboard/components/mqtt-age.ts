import { Attribute } from "@dagda/client/src/components/abstract.webcomponent";
import { AbstractMqttComponent } from "./base";

const TICK_MS = 1000;

/** `<mqtt-age topic="…" unit="…">` — how long ago a topic's last message arrived (Dagda ROADMAP tranche 4, FEATURES §6.1) */
export class MqttAgeElement extends AbstractMqttComponent {

    /** `"auto"` (default) picks seconds/minutes/hours/days by magnitude; `"s"`/`"m"`/`"h"`/`"d"` forces one */
    @Attribute()
    protected _unit!: string | null;

    protected _timer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        super();
    }

    protected override async _init(): Promise<void> {
        await super._init();
        // The age changes on its own, without a new message — nothing else
        // would ever trigger a re-render otherwise.
        this._timer = setInterval(() => {
            this.refresh().catch((err: unknown) => console.error("Error refreshing <mqtt-age>", err));
        }, TICK_MS);
    }

    public override disconnectedCallback(): void {
        super.disconnectedCallback();
        if (this._timer != null) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }

    protected override async _refresh(): Promise<void> {
        const record = this._record();
        if (record == null) {
            this.textContent = "";
            return;
        }
        const ageMs = Math.max(0, Date.now() - record.receivedAt);
        this.textContent = formatAge(ageMs, this._unit);
    }

}

function formatAge(ageMs: number, unit: string | null): string {
    const seconds = Math.floor(ageMs / 1000);
    if (unit === "s") {
        return `${seconds}s`;
    }
    if (unit === "m") {
        return `${Math.floor(seconds / 60)}m`;
    }
    if (unit === "h") {
        return `${Math.floor(seconds / 3600)}h`;
    }
    if (unit === "d") {
        return `${Math.floor(seconds / 86400)}j`;
    }
    // "auto", or anything unrecognized: the largest unit that gives at least 1.
    if (seconds < 60) {
        return `${seconds}s`;
    }
    if (seconds < 3600) {
        return `${Math.floor(seconds / 60)}m`;
    }
    if (seconds < 86400) {
        return `${Math.floor(seconds / 3600)}h`;
    }
    return `${Math.floor(seconds / 86400)}j`;
}

customElements.define("mqtt-age", MqttAgeElement);
