import { describe, expect, it } from "vitest";
import { resolvePath, tokenizePath } from "./path";

describe("tokenizePath", () => {

    it("splits a dotted path", () => {
        expect(tokenizePath("a.b.c")).toEqual(["a", "b", "c"]);
    });

    it("splits a bracketed numeric index", () => {
        expect(tokenizePath("a[0].b")).toEqual(["a", "0", "b"]);
    });

    it("splits a quoted bracket segment, single or double quotes", () => {
        expect(tokenizePath('a["with space"]')).toEqual(["a", "with space"]);
        expect(tokenizePath("a['with space']")).toEqual(["a", "with space"]);
    });

    it("strips a leading $. or bare $", () => {
        expect(tokenizePath("$.a.b")).toEqual(["a", "b"]);
        expect(tokenizePath("$a.b")).toEqual(["a", "b"]);
    });

    it("throws on an unbalanced bracket", () => {
        expect(() => tokenizePath("a[0")).toThrow(/Unbalanced/);
    });

});

describe("resolvePath", () => {

    it("reads a nested field", () => {
        expect(resolvePath({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42);
    });

    it("reads an array element", () => {
        expect(resolvePath({ a: [10, 20, 30] }, "a[1]")).toBe(20);
    });

    it("reads a key containing a space via bracket-quote syntax", () => {
        expect(resolvePath({ "a b": 1 }, '["a b"]')).toBe(1);
    });

    it("returns undefined for a missing key, without throwing", () => {
        expect(resolvePath({ a: 1 }, "b.c.d")).toBeUndefined();
    });

    it("returns undefined when the path runs into a scalar", () => {
        expect(resolvePath({ a: 1 }, "a.b")).toBeUndefined();
    });

    it("returns undefined for a malformed path, without throwing", () => {
        expect(() => resolvePath({ a: 1 }, "a[0")).not.toThrow();
        expect(resolvePath({ a: 1 }, "a[0")).toBeUndefined();
    });

    it("returns undefined against null or undefined root", () => {
        expect(resolvePath(null, "a")).toBeUndefined();
        expect(resolvePath(undefined, "a")).toBeUndefined();
    });

    it("returns the root itself for an empty path", () => {
        expect(resolvePath({ a: 1 }, "")).toEqual({ a: 1 });
    });

});
