import { describe, expect, it } from "vitest";
import { evaluateExpression, ExpressionScope } from "./evaluate";

function scope(overrides: Partial<ExpressionScope> = {}): ExpressionScope {
    return {
        payload: null,
        value: null,
        topic: "a/b",
        previous: null,
        now: 0,
        ...overrides
    };
}

describe("evaluateExpression", () => {

    it("evaluates a literal boolean", () => {
        expect(evaluateExpression("true", scope())).toBe(true);
        expect(evaluateExpression("false", scope())).toBe(false);
    });

    it("evaluates equality against a path", () => {
        expect(evaluateExpression('value == "on"', scope({ value: "on" }))).toBe(true);
        expect(evaluateExpression('value == "on"', scope({ value: "off" }))).toBe(false);
    });

    it("evaluates a nested path", () => {
        expect(evaluateExpression("payload.temperature > 20", scope({ payload: { temperature: 25 } }))).toBe(true);
        expect(evaluateExpression("payload.temperature > 20", scope({ payload: { temperature: 15 } }))).toBe(false);
    });

    it("evaluates && and ||, with && binding tighter", () => {
        // a || (b && c), not (a || b) && c
        expect(evaluateExpression("true || false && false", scope())).toBe(true);
        expect(evaluateExpression("false && false || true", scope())).toBe(true);
        expect(evaluateExpression("false && (false || true)", scope())).toBe(false);
    });

    it("evaluates negation", () => {
        expect(evaluateExpression("!false", scope())).toBe(true);
        expect(evaluateExpression('!(value == "on")', scope({ value: "on" }))).toBe(false);
    });

    it("evaluates numeric comparisons", () => {
        expect(evaluateExpression("value >= 10", scope({ value: 10 }))).toBe(true);
        expect(evaluateExpression("value >= 10", scope({ value: 9 }))).toBe(false);
        expect(evaluateExpression("value < 10", scope({ value: 9 }))).toBe(true);
    });

    it("reads previous, for a value-changed check", () => {
        expect(evaluateExpression("value != previous", scope({ value: 5, previous: 4 }))).toBe(true);
        expect(evaluateExpression("value != previous", scope({ value: 5, previous: 5 }))).toBe(false);
    });

    it("reads topic", () => {
        expect(evaluateExpression('topic == "a/b"', scope({ topic: "a/b" }))).toBe(true);
    });

    it("a missing field compares as undefined, not an error", () => {
        expect(evaluateExpression("payload.missing == null", scope({ payload: {} }))).toBe(true);
        expect(evaluateExpression("payload.missing > 5", scope({ payload: {} }))).toBe(false);
    });

    it("treats the string \"false\" as falsy, unlike bare JavaScript", () => {
        expect(evaluateExpression("value", scope({ value: "false" }))).toBe(false);
        expect(evaluateExpression("value", scope({ value: "0" }))).toBe(false);
        expect(evaluateExpression("value", scope({ value: "hello" }))).toBe(true);
    });

    it("throws on a malformed expression — an author error, not a data miss", () => {
        expect(() => evaluateExpression("value ==", scope())).toThrow();
        expect(() => evaluateExpression("&& value", scope())).toThrow();
    });

    it("caches by source string across calls", () => {
        // No direct way to observe the cache from here; this just guards
        // against the compiled form leaking state between two different
        // scopes evaluated against the same source.
        expect(evaluateExpression("value == 1", scope({ value: 1 }))).toBe(true);
        expect(evaluateExpression("value == 1", scope({ value: 2 }))).toBe(false);
    });

});
