import { ContextAdapter } from "@dagda/shared/src/entities/tools/adapters";
import { BaseContext } from "@dagda/shared/src/entities/types";
import { assertUnreachable } from "@dagda/shared/src/tools/asserts";
import { TopicId } from "./types";

//#region Fetch contexts ------------------------------------------------------

/** Every known topic, each with its last message. Feeds the status page. */
export type TopicsContext = BaseContext<"topics", undefined>;

/** One topic with its full message history. */
export type TopicContext = BaseContext<"topic", { topicId: TopicId }>;

/** List of all contexts */
export type AppContexts = TopicsContext | TopicContext;

//#endregion

//#region Context adapter -----------------------------------------------------

/**
 * Implementation of the context adapter for the application.
 *
 * The two notions are not interchangeable here, which is the whole point:
 * - `contextEquals` answers "is this the same request?", used to know whether a
 *   context is already loaded;
 * - `contextIntersects` answers "could a change in that context affect this
 *   one?", used to invalidate caches.
 *
 * A message arriving on one topic changes both that topic's history *and* the
 * topic list, since the list carries `lastMessageAt`. So the two context types
 * intersect across type boundaries — which no "always / never / same options"
 * helper covers on its own.
 */
export class AppContextAdapter implements ContextAdapter<AppContexts> {

    /** @inheritdoc */
    public contextEquals(newContext: AppContexts, oldContext: AppContexts): boolean {
        if (newContext.type !== oldContext.type) {
            return false;
        }
        switch (newContext.type) {
            case "topics": {
                return true; // No options to compare
            }
            case "topic": {
                return newContext.options.topicId === (oldContext as TopicContext).options.topicId;
            }
            default: {
                assertUnreachable(newContext);
            }
        }
    }

    /** @inheritdoc */
    public contextIntersects(newContext: AppContexts, oldContext: AppContexts): boolean {
        // The topic list holds the date of the last message of every topic, so
        // anything happening on any topic touches it.
        if (newContext.type === "topics" || oldContext.type === "topics") {
            return true;
        }
        // Two histories only intersect when they are the same topic.
        return newContext.options.topicId === oldContext.options.topicId;
    }

}

//#endregion
