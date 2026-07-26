import { describe, expect, it } from "vitest";
import { DateTimeFieldEditor } from "./datetime.editor";

describe("DateTimeFieldEditor", () => {

    it("starts empty, reading back as null", () => {
        expect(new DateTimeFieldEditor().value).toBeNull();
    });

    it("round-trips a value through the underlying input, to the minute", () => {
        const editor = new DateTimeFieldEditor();
        const date = new Date(2026, 2, 5, 14, 30, 0, 0); // month is 0-based: March
        editor.value = date.getTime();
        expect(editor.value).toBe(date.getTime());
    });

    it("treats null as clearing the field", () => {
        const editor = new DateTimeFieldEditor();
        editor.value = Date.now();
        editor.value = null;
        expect(editor.value).toBeNull();
    });

    it("accepts an empty field, leaving 'required' to the caller", () => {
        expect(new DateTimeFieldEditor().getValueError()).toBeNull();
    });

    it("accepts a configured value", () => {
        const editor = new DateTimeFieldEditor();
        editor.value = Date.now();
        expect(editor.getValueError()).toBeNull();
    });

});
