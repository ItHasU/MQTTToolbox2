import { DagdaAppEvents } from "@dagda/shared/src/notification/events";
import { AppContexts } from "./entities/contexts";
import { AppEvents } from "./entities/events";

/**
 * Framework events plus the application's own.
 *
 * Declared in AppTypes["events"], which is what types the notification service
 * on both sides. Without it the events fall back to the framework's, and an
 * application event compiles as `unknown` instead of being checked.
 *
 * `DagdaAppEvents` rather than `DagdaEvents`: it adds `contextChanged`, which
 * carries the application's contexts. The server broadcasts it when it ingests
 * a message, since nothing else would tell the clients their cache went stale.
 */
export type AppNotifications = DagdaAppEvents<AppContexts> & AppEvents;
