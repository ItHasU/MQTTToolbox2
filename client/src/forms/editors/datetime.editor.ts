import { AbstractWebComponent, Ref } from "@dagda/client/src/components/abstract.webcomponent";
import { FieldEditor } from "@dagda/client/src/forms/editors";
import template from "./datetime.editor.html";

/**
 * Editor for the `TIMESTAMP` named type (an epoch-millisecond `JSTypes.number`
 * under the hood, MQTTToolbox `shared/src/entities/model.ts`).
 *
 * Registered as an override, not a framework default (Dagda FEATURES §8.1):
 * `rawType: JSTypes.number` also covers plain integers, which have no
 * business turning into a date picker — only the type an application chose
 * to name "a timestamp" does.
 */
export class DateTimeFieldEditor extends AbstractWebComponent implements FieldEditor<number> {

    @Ref()
    protected _input!: HTMLInputElement;

    constructor() {
        super({ template });
    }

    protected override async _refresh(): Promise<void> { /* static markup, nothing to render */ }

    public get value(): number | null {
        if (this._input.value === "") {
            return null;
        }
        // "datetime-local" reads as wall-clock time with no timezone, which
        // `Date` parses as UTC unless read back through its component
        // getters/setters — the local offset the user actually meant.
        const [datePart, timePart] = this._input.value.split("T");
        const [year, month, day] = datePart!.split("-").map(Number);
        const [hours, minutes] = timePart!.split(":").map(Number);
        return new Date(year!, month! - 1, day!, hours!, minutes!).getTime();
    }

    public set value(value: number | null) {
        if (value == null) {
            this._input.value = "";
            return;
        }
        const date = new Date(value);
        const pad = (n: number): string => String(n).padStart(2, "0");
        this._input.value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    public getValueError(): string | null {
        if (this._input.value === "") {
            return null; // emptiness is a "required" concern, not this editor's
        }
        return this.value != null && Number.isFinite(this.value) ? null : "expected a date and time";
    }

}

customElements.define("mqtt-field-datetime", DateTimeFieldEditor);
