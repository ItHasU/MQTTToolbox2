import {
    alsoIntersectsOtherTypes,
    alwaysIntersects,
    buildContextAdapter,
    intersectsOnEqualOptions
} from "@dagda/shared/src/entities/tools/contexts";
import { BaseContext } from "@dagda/shared/src/entities/types";
import { TopicId } from "./types";

//#region Fetch contexts ------------------------------------------------------

/** Every known topic, each with the date of its last message. Feeds the status page. */
export type TopicsContext = BaseContext<"topics", undefined>;

/** One topic with its full message history. */
export type TopicContext = BaseContext<"topic", { topicId: TopicId }>;

/** List of all contexts */
export type AppContexts = TopicsContext | TopicContext;

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
 */
export const APP_CONTEXT_ADAPTER = buildContextAdapter<AppContexts>({
    topics: alsoIntersectsOtherTypes(alwaysIntersects()),
    topic: intersectsOnEqualOptions()
});

//#endregion
