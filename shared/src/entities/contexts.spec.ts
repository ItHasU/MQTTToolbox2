import { asNamed } from "@dagda/shared/src/entities/tools/named";
import { describe, expect, it } from "vitest";
import { APP_CONTEXT_ADAPTER, AppContexts } from "./contexts";
import { TopicId } from "./types";

const topicId = (id: number): TopicId => asNamed(id);

const TOPICS: AppContexts = { type: "topics", options: undefined };
const topic = (id: number): AppContexts => ({ type: "topic", options: { topicId: topicId(id) } });

describe("AppContextAdapter", () => {

    // The assertions below are unchanged from the hand-written adapter they
    // replaced: they are what checks the framework helpers really cover the case.
    const adapter = APP_CONTEXT_ADAPTER;

    describe("contextEquals", () => {

        it("matches two requests for the topic list", () => {
            expect(adapter.contextEquals(TOPICS, TOPICS)).toBe(true);
        });

        it("matches two requests for the same topic", () => {
            expect(adapter.contextEquals(topic(1), topic(1))).toBe(true);
        });

        it("separates two different topics", () => {
            expect(adapter.contextEquals(topic(1), topic(2))).toBe(false);
        });

        it("separates contexts of different types", () => {
            expect(adapter.contextEquals(TOPICS, topic(1))).toBe(false);
            expect(adapter.contextEquals(topic(1), TOPICS)).toBe(false);
        });

    });

    describe("contextIntersects", () => {

        it("is not the same thing as equality", () => {
            // This is the whole reason the two methods exist separately: a
            // message on topic 1 leaves the topic list stale, although the two
            // contexts are different requests.
            expect(adapter.contextEquals(TOPICS, topic(1))).toBe(false);
            expect(adapter.contextIntersects(TOPICS, topic(1))).toBe(true);
        });

        it("invalidates the topic list whichever topic changed", () => {
            expect(adapter.contextIntersects(topic(42), TOPICS)).toBe(true);
            expect(adapter.contextIntersects(TOPICS, topic(42))).toBe(true);
        });

        it("invalidates the topic list when the list itself changed", () => {
            expect(adapter.contextIntersects(TOPICS, TOPICS)).toBe(true);
        });

        it("keeps two topic histories independent", () => {
            expect(adapter.contextIntersects(topic(1), topic(2))).toBe(false);
        });

        it("invalidates a topic history when that topic changed", () => {
            expect(adapter.contextIntersects(topic(1), topic(1))).toBe(true);
        });

        it("is symmetric", () => {
            const cases: [AppContexts, AppContexts][] = [
                [TOPICS, TOPICS],
                [TOPICS, topic(1)],
                [topic(1), topic(1)],
                [topic(1), topic(2)],
            ];
            for (const [a, b] of cases) {
                expect(
                    adapter.contextIntersects(a, b),
                    `intersection must not depend on the order of ${a.type} and ${b.type}`
                ).toBe(adapter.contextIntersects(b, a));
            }
        });

    });

});
