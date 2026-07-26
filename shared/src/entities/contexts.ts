import {
    alsoIntersectsOtherTypes,
    alwaysIntersects,
    buildContextAdapter,
    intersectsOnEqualOptions
} from "@dagda/shared/src/entities/tools/contexts";
import { BaseContext } from "@dagda/shared/src/entities/types";
import { DashboardId, TopicId } from "./types";

//#region Fetch contexts ------------------------------------------------------

/** Every known topic, each with the date of its last message. Feeds the status page. */
export type TopicsContext = BaseContext<"topics", undefined>;

/** One topic with its full message history. */
export type TopicContext = BaseContext<"topic", { topicId: TopicId }>;

/**
 * Every dashboard the caller may see — owned or shared with them — with its
 * HTML content, plus the share rows for the ones they own (Dagda ROADMAP
 * tranche 4). One fetch feeds the whole swipeable dashboard list.
 */
export type DashboardsContext = BaseContext<"dashboards", undefined>;

/** One dashboard, for the editor. */
export type DashboardContext = BaseContext<"dashboard", { dashboardId: DashboardId }>;

/**
 * The last message of every topic (Dagda ROADMAP tranche 4) — a dashboard's
 * whole initial state in one fetch, for `MQTT.get`/`getAll`/`list()`
 * (FEATURES §6.2) and the components built on them. Distinct from `topics`:
 * that one is names and dates only (the status page's shape), this one
 * carries the payload every dashboard component actually reads.
 */
export type LastMessagesContext = BaseContext<"lastMessages", undefined>;

/** List of all contexts */
export type AppContexts = TopicsContext | TopicContext | DashboardsContext | DashboardContext | LastMessagesContext;

//#endregion

//#region Context adapter -----------------------------------------------------

/**
 * How the application invalidates its caches.
 *
 * The two notions the framework asks for are not interchangeable here:
 * - `equals` answers "is this the same request?", to know whether a context is
 *   already loaded;
 * - `intersects` answers "could a change over there make this stale?".
 *
 * The topic list carries `lastMessageAt` for every topic, so a message arriving
 * on any topic makes it stale — including a message reported as a change on a
 * `topic` context, which is a *different* context type. That relation is what
 * `alsoIntersectsOtherTypes` declares.
 *
 * It matters because messages are written by the server ingesting MQTT, not by
 * a client: the writer only ever broadcasts the one context it wrote, and each
 * client has to work out for itself what that makes stale on its side.
 *
 * The relation is declared on one side only. The framework asks both sides and
 * keeps true if either says so, so the intersection stays symmetric.
 *
 * `dashboards`/`dashboard` mirror `topics`/`topic` exactly, same reasoning:
 * the list carries enough (name, sort order) that any single dashboard's
 * change — a rename, a share granted or revoked — should be treated as
 * potentially stale for it too.
 *
 * `lastMessages` mirrors `topics` for the same reason `topics` itself does:
 * a message on any topic can change what it holds, and a `topic` broadcast
 * is a different context type it would otherwise never hear about. In
 * practice `MessageIngestor` also fires `messagesIngested` (a push, not a
 * cache invalidation) for the same event, which is the fast path a
 * dashboard component actually uses (`ingest.ts`) — this relation is the
 * correctness backstop for whoever fetched `lastMessages` without also
 * subscribing to that event.
 */
export const APP_CONTEXT_ADAPTER = buildContextAdapter<AppContexts>({
    topics: alsoIntersectsOtherTypes(alwaysIntersects()),
    topic: intersectsOnEqualOptions(),
    dashboards: alsoIntersectsOtherTypes(alwaysIntersects()),
    dashboard: intersectsOnEqualOptions(),
    lastMessages: alsoIntersectsOtherTypes(alwaysIntersects())
});

//#endregion
