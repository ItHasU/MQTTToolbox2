import { ScheduledPublish, SchedulePublishParams } from "@mqtt-toolbox/shared/src/actions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublishScheduler } from "./scheduler";

function params(overrides: Partial<SchedulePublishParams> = {}): SchedulePublishParams {
    return { topic: "a/b", payload: "hello", sendAt: Date.now() + 10000, ...overrides };
}

describe("PublishScheduler", () => {

    let publish: ReturnType<typeof vi.fn<(params: SchedulePublishParams, userId: number) => Promise<void>>>;
    let onChange: ReturnType<typeof vi.fn<(pending: ScheduledPublish[]) => void>>;
    let scheduler: PublishScheduler;

    beforeEach(() => {
        vi.useFakeTimers();
        publish = vi.fn().mockResolvedValue(undefined);
        onChange = vi.fn();
        scheduler = new PublishScheduler({ publish, onChange, log: () => { /* silence expected failures */ } });
    });

    afterEach(() => {
        scheduler.stop();
        vi.useRealTimers();
    });

    it("does not publish before the scheduled time", () => {
        scheduler.schedule(params({ sendAt: Date.now() + 10000 }), 1);
        vi.advanceTimersByTime(9999);
        expect(publish).not.toHaveBeenCalled();
    });

    it("publishes at the scheduled time, with the scheduling user", () => {
        const entry = scheduler.schedule(params({ topic: "a/b", payload: "hello", sendAt: Date.now() + 5000 }), 42);
        vi.advanceTimersByTime(5000);
        expect(publish).toHaveBeenCalledWith(expect.objectContaining({ topic: "a/b", payload: "hello", id: entry.id }), 42);
    });

    it("defaults retain and qos like an immediate publish would", () => {
        const entry = scheduler.schedule(params(), 1);
        expect(entry.retain).toBe(false);
        expect(entry.qos).toBe(0);
    });

    it("carries retain and qos through to firing", () => {
        scheduler.schedule(params({ retain: true, qos: 2 }), 1);
        vi.advanceTimersByTime(10000);
        expect(publish).toHaveBeenCalledWith(expect.objectContaining({ retain: true, qos: 2 }), 1);
    });

    it("lists what is pending, soonest first", () => {
        const later = scheduler.schedule(params({ sendAt: Date.now() + 20000 }), 1);
        const sooner = scheduler.schedule(params({ sendAt: Date.now() + 5000 }), 1);
        expect(scheduler.list().map(p => p.id)).toEqual([sooner.id, later.id]);
    });

    it("removes an entry from the list once it fires", () => {
        scheduler.schedule(params({ sendAt: Date.now() + 5000 }), 1);
        vi.advanceTimersByTime(5000);
        expect(scheduler.list()).toEqual([]);
    });

    it("notifies onChange when scheduled, and again when fired", () => {
        scheduler.schedule(params({ sendAt: Date.now() + 5000 }), 1);
        expect(onChange).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(5000);
        expect(onChange).toHaveBeenCalledTimes(2);
        expect(onChange).toHaveBeenLastCalledWith([]);
    });

    it("cancels a pending publish, which never fires and disappears from the list", async () => {
        const entry = scheduler.schedule(params({ sendAt: Date.now() + 5000 }), 1);
        scheduler.cancel(entry.id);
        vi.advanceTimersByTime(5000);
        expect(publish).not.toHaveBeenCalled();
        expect(scheduler.list()).toEqual([]);
    });

    it("notifies onChange on cancellation", () => {
        const entry = scheduler.schedule(params(), 1);
        onChange.mockClear();
        scheduler.cancel(entry.id);
        expect(onChange).toHaveBeenCalledWith([]);
    });

    it("does nothing when cancelling an id that does not exist", () => {
        onChange.mockClear();
        scheduler.cancel(999);
        expect(onChange).not.toHaveBeenCalled();
    });

    it("does nothing when cancelling an id that already fired", () => {
        const entry = scheduler.schedule(params({ sendAt: Date.now() + 5000 }), 1);
        vi.advanceTimersByTime(5000);
        onChange.mockClear();
        scheduler.cancel(entry.id);
        expect(onChange).not.toHaveBeenCalled();
    });

    it("logs, rather than throws, when the publish itself fails", async () => {
        const log = vi.fn();
        const failing = new PublishScheduler({ publish: () => Promise.reject(new Error("broker down")), onChange, log });
        failing.schedule(params({ sendAt: Date.now() + 5000 }), 1);
        vi.advanceTimersByTime(5000);
        await vi.waitFor(() => expect(log).toHaveBeenCalledWith(expect.stringContaining("broker down")));
        failing.stop();
    });

    it("stop() cancels every pending publish", () => {
        scheduler.schedule(params({ sendAt: Date.now() + 5000 }), 1);
        scheduler.schedule(params({ sendAt: Date.now() + 8000 }), 1);
        scheduler.stop();
        vi.advanceTimersByTime(8000);
        expect(publish).not.toHaveBeenCalled();
    });

    it("assigns each scheduled publish a distinct, stable id", () => {
        const a = scheduler.schedule(params(), 1);
        const b = scheduler.schedule(params(), 1);
        expect(a.id).not.toBe(b.id);
    });

    it("treats a past sendAt as immediate rather than throwing", () => {
        scheduler.schedule(params({ sendAt: Date.now() - 5000 }), 1);
        vi.advanceTimersByTime(0);
        expect(publish).toHaveBeenCalled();
    });

});
