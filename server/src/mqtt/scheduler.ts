import { ScheduledPublish, SchedulePublishParams } from "@mqtt-toolbox/shared/src/actions";

export interface PublishSchedulerParams {
    /** Actually sends the message, exactly as an immediate publish would (FEATURES §3) */
    publish: (params: SchedulePublishParams, userId: number) => Promise<void>;
    /** Called with the full pending list every time it changes */
    onChange: (pending: ScheduledPublish[]) => void;
    /** Where a firing failure is reported. Defaults to the console */
    log?: (message: string) => void;
}

/**
 * Queues publishes for later (MQTTToolbox FEATURES §3, "publication différée").
 *
 * In-memory only, on purpose (ROADMAP tranche 2): a `setTimeout` per pending
 * message, nothing written to disk. A scheduled publish is lost if the server
 * restarts before it fires — an accepted gap, not an oversight, until the
 * queue moves to Dagda's own persistence.
 */
export class PublishScheduler {

    protected readonly _pending = new Map<number, { entry: ScheduledPublish; userId: number; timer: ReturnType<typeof setTimeout> }>();
    protected _nextId = 1;

    constructor(protected readonly _params: PublishSchedulerParams) { }

    /** Queue a publish, firing at `params.sendAt` */
    public schedule(params: SchedulePublishParams, userId: number): ScheduledPublish {
        const id = this._nextId++;
        const entry: ScheduledPublish = {
            id,
            topic: params.topic,
            payload: params.payload,
            retain: params.retain ?? false,
            qos: params.qos ?? 0,
            sendAt: params.sendAt
        };

        const timer = setTimeout(() => { this._fire(id); }, Math.max(0, params.sendAt - Date.now()));
        // A pending publish must never be what keeps the process alive.
        timer.unref?.();

        this._pending.set(id, { entry, userId, timer });
        this._notifyChange();
        return entry;
    }

    /** Cancel a pending publish. Does nothing if it already fired or never existed */
    public cancel(id: number): void {
        const pending = this._pending.get(id);
        if (pending == null) {
            return;
        }
        clearTimeout(pending.timer);
        this._pending.delete(id);
        this._notifyChange();
    }

    /** The pending publishes, soonest first */
    public list(): ScheduledPublish[] {
        return Array.from(this._pending.values())
            .map(pending => pending.entry)
            .sort((a, b) => a.sendAt - b.sendAt);
    }

    /** Cancel every pending publish, e.g. on server shutdown */
    public stop(): void {
        for (const pending of this._pending.values()) {
            clearTimeout(pending.timer);
        }
        this._pending.clear();
    }

    protected _fire(id: number): void {
        const pending = this._pending.get(id);
        if (pending == null) {
            return; // cancelled between the timer firing and this running
        }
        this._pending.delete(id);
        this._notifyChange();

        this._params.publish(pending.entry, pending.userId).catch((error: unknown) => {
            // Firing already happened from the caller's point of view — there
            // is no pending state left to reflect a failure in, only a log.
            const message = error instanceof Error ? error.message : String(error);
            (this._params.log ?? ((m: string) => console.log(m)))(`Failed to send the scheduled publish on "${pending.entry.topic}": ${message}`);
        });
    }

    protected _notifyChange(): void {
        this._params.onChange(this.list());
    }

}
