import { Attribute } from "@dagda/client/src/components/abstract.webcomponent";
import { evaluateExpression } from "@mqtt-toolbox/shared/src/expression/evaluate";
import { resolvePath } from "@mqtt-toolbox/shared/src/expression/path";
import { AbstractMqttComponent } from "./base";

/**
 * `<mqtt-if topic="…" path="…" equals="…">` (or `not-equals`, or `expr="…"`)
 * — shows or hides its own content depending on a topic's value (Dagda
 * ROADMAP tranche 4, FEATURES §6.1). A `<slot>` template, not raw children:
 * `AbstractWebComponent`'s constructor redistributes whatever the dashboard
 * author nested inside `<mqtt-if>…</mqtt-if>` into it — without one, those
 * nodes would be cleared and never reappear.
 *
 * `path`/`equals`/`not-equals` is the original, v1-compatible vocabulary;
 * `expr` is the richer one from `shared/src/expression/` (`||`, `&&`,
 * comparisons, paths) — `expr`, when given, wins outright rather than being
 * combined with the others.
 */
export class MqttIfElement extends AbstractMqttComponent {

    @Attribute()
    protected _path!: string | null;

    @Attribute()
    protected _equals!: string | null;

    @Attribute({ name: "not-equals" })
    protected _notEquals!: string | null;

    @Attribute()
    protected _expr!: string | null;

    /** The payload as of the previous refresh — the `previous` an `expr` may read (FEATURES §5.2's "value changed") */
    protected _previousPayload: unknown = undefined;

    constructor() {
        super({ template: "<slot></slot>" });
    }

    protected override async _refresh(): Promise<void> {
        const payload = this._value();
        this.style.display = this._evaluate(payload) ? "" : "none";
        this._previousPayload = payload;
    }

    protected _evaluate(payload: unknown): boolean {
        if (this._expr != null) {
            try {
                return evaluateExpression(this._expr, {
                    payload,
                    value: payload,
                    topic: this._topic ?? "",
                    previous: this._previousPayload,
                    now: Date.now()
                });
            } catch (err) {
                console.error(`<mqtt-if expr="${this._expr}">: malformed expression`, err);
                return false;
            }
        }

        const extracted = this._path == null ? payload : resolvePath(payload, this._path);
        if (this._equals != null) {
            return String(extracted) === this._equals;
        }
        if (this._notEquals != null) {
            return String(extracted) !== this._notEquals;
        }
        return Boolean(extracted);
    }

}
customElements.define("mqtt-if", MqttIfElement);
