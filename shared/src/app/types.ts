import { EntitiesAPI } from "@dagda/shared/src/api/impl/entities.api";
import { SystemAPI } from "@dagda/shared/src/api/impl/system.api";
import { BaseAppTypes } from "@dagda/shared/src/app/types";
import { AppActions } from "../actions";
import { AppContexts } from "../entities/contexts";
import { AppEntityTypes, AppFieldTypes } from "../entities/types";
import { AppPermission } from "../permissions";
import { AppNotifications } from "../services";

/** The contract both sides of the application compile against */
export interface AppTypes extends BaseAppTypes {
    fieldTypes: AppFieldTypes;
    entities: AppEntityTypes;
    contexts: AppContexts;
    apis: SystemAPI & EntitiesAPI<AppContexts, AppEntityTypes>;
    actions: AppActions;
    // Without this the notification service is typed on the framework
    // events alone, and brokerStateChanged compiles as unknown.
    events: AppNotifications;
    permissions: AppPermission;
}
