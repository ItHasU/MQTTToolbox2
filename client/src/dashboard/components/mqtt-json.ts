import { Attribute } from "@dagda/client/src/components/abstract.webcomponent";
import { resolvePath } from "@mqtt-toolbox/shared/src/expression/path";
import { AbstractMqttComponent } from "./base";

/**
 * `<mqtt-json topic="…" path="…">` — a value extracted from a topic's JSON
 * payload (Dagda ROADMAP tranche 4, FEATURES §6.1). `path` through
 * `resolvePath()` (`shared/src/expression/path.ts`), not `new Function()`
 * as in v1 — see that file for why.
 */
export class MqttJsonElement extends AbstractMqttComponent {

    @Attribute()
    protected _path!: string | null;

    constructor() {
        super();
    }

    protected override async _refresh(): Promise<void> {
        const root = this._value();
        const extracted = this._path == null ? root : resolvePath(root, this._path);
        this.textContent = extracted == null ? "" : (typeof extracted === "string" ? extracted : JSON.stringify(extracted));
    }

}
customElements.define("mqtt-json", MqttJsonElement);
