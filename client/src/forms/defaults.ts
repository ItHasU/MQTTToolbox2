import { defaultFieldEditors } from "@dagda/client/src/forms/editors";
import { registerDefaultFieldEditors } from "@dagda/client/src/forms/defaults";
import { DateTimeFieldEditor } from "./editors/datetime.editor";

/**
 * Wires up the form generator's editors (Dagda FEATURES §8.1) for this
 * application: the framework's defaults, plus this application's own
 * override for its `TIMESTAMP` named type.
 */
export function registerAppFieldEditors(): void {
    registerDefaultFieldEditors();
    defaultFieldEditors.registerForType("TIMESTAMP", () => new DateTimeFieldEditor());
}
