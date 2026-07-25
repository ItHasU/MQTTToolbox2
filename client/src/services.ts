import { buildClientEntitiesService } from "@dagda/client/src/entities/service";
import { ClientNotificationImpl } from "@dagda/client/src/notification/notification.impl";
import { PageHandler } from "@dagda/client/src/pages/handler";
import { PageService } from "@dagda/client/src/pages/service";
import { Dagda } from "@dagda/shared/src/dagda";
import { buildConsoleLogService } from "@dagda/shared/src/tools/log";
import { APP_CONTEXT_ADAPTER } from "@mqtt-toolbox/shared/src/entities/contexts";
import { APP_MODEL } from "@mqtt-toolbox/shared/src/entities/model";
import { AppNotifications, SharedServices } from "@mqtt-toolbox/shared/src/services";
import { StatusPage } from "./pages/status/status.page";

export type AppPages = {
    "status": StatusPage;
};

export type AppPageService = PageService<AppPages>;

/** Everything reachable through Dagda.get() on the client */
export type ClientServices = SharedServices & AppPageService;

export function initServices(): void {
    const pageHandler = new PageHandler<AppPages>();
    pageHandler.registerPage("status", { order: 1, title: "Statut", constructor: StatusPage });

    Dagda.init<ClientServices>({
        log: buildConsoleLogService(),
        // The type argument is what makes the application's own events
        // (brokerStateChanged) typed on both ends.
        notification: new ClientNotificationImpl<AppNotifications>(),
        entities: buildClientEntitiesService(APP_MODEL, APP_CONTEXT_ADAPTER),
        pages: pageHandler
    });
}
