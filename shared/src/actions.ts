import { EntitiesModel } from "@dagda/shared/src/entities/model";

/**
 * MQTT QoS levels, as a declarative enumeration (Dagda FEATURES §2) rather
 * than a bare `0 | 1 | 2`: the label is what the publish form's dropdown
 * (FEATURES §8.1) displays, so no screen carries its own lookup table.
 */
export const QOS = EntitiesModel.enum({
    AT_MOST_ONCE: { value: 0, label: "0 — Au plus une fois" },
    AT_LEAST_ONCE: { value: 1, label: "1 — Au moins une fois" },
    EXACTLY_ONCE: { value: 2, label: "2 — Exactement une fois" }
});

/** Publish a message on a topic (FEATURES §3) */
export interface PublishMessageParams {
    topic: string;
    /** Text only for now — a binary payload needs a form control this first slice does not have yet */
    payload: string;
    retain?: boolean;
    qos?: 0 | 1 | 2;
}

/** A publish scheduled for later (FEATURES §3, "publication différée") */
export interface SchedulePublishParams extends PublishMessageParams {
    /** Epoch milliseconds when the message should be sent, always in the future */
    sendAt: number;
}

/**
 * A pending scheduled publish, as the client sees it: enough to list it and
 * to ask for its cancellation, nothing about who scheduled it — MQTTToolbox
 * has no permission matrix yet (Dagda ROADMAP tranche 3), so there is no
 * screen this would be hidden from anyway.
 */
export interface ScheduledPublish {
    id: number;
    topic: string;
    payload: string;
    retain: boolean;
    qos: 0 | 1 | 2;
    /** Epoch milliseconds when it will fire */
    sendAt: number;
}

/**
 * The application's action vocabulary (Dagda FEATURES §11.1).
 *
 * `publishMessage` does not record anything itself: if the broker echoes the
 * publish back (only when the subscription covers the topic), `ingest.ts`
 * records it exactly like any other message. Recording it here too would
 * double the history row; not recording it at all here means there is
 * nothing to lose if the echo never comes.
 *
 * The scheduled queue lives in memory only (ROADMAP tranche 2 — "prend
 * l'option d'un setTimeout, ce n'est pas grave si on perd un envoi de message
 * quand le serveur redémarre"): `listScheduledPublishes` is a snapshot, kept
 * live on the client by the `scheduledPublishesChanged` notification rather
 * than polling.
 */
export type AppActions = {
    publishMessage(params: PublishMessageParams): Promise<void>;
    schedulePublish(params: SchedulePublishParams): Promise<ScheduledPublish>;
    cancelScheduledPublish(params: { id: number }): Promise<void>;
    listScheduledPublishes(): Promise<ScheduledPublish[]>;
};
