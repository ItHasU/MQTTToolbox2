import { EntitiesService } from "@dagda/shared/src/entities/service";
import { DagdaEvents } from "@dagda/shared/src/notification/events";
import { NotificationService } from "@dagda/shared/src/notification/service";
import { LogService } from "@dagda/shared/src/tools/log";
import { AppEvents } from "./entities/events";
import { AppContexts } from "./entities/contexts";
import { AppEntityTypes } from "./entities/types";

/** Framework events plus the application's own */
export type AppNotifications = DagdaEvents & AppEvents;

/**
 * Services available on both sides.
 * The declaration is shared; the implementations differ.
 */
export interface SharedServices extends
    LogService,
    EntitiesService<AppEntityTypes, AppContexts>,
    NotificationService<AppNotifications> {
}
