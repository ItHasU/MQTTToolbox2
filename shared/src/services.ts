import { DagdaEvents } from "@dagda/shared/src/notification/events";
import { AppEvents } from "./entities/events";

/**
 * Framework events plus the application's own.
 *
 * Declared in AppTypes["events"], which is what types the notification service
 * on both sides. Without it the events fall back to the framework's, and an
 * application event compiles as `unknown` instead of being checked.
 */
export type AppNotifications = DagdaEvents & AppEvents;
