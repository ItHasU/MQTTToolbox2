import { DagdaClient } from "@dagda/client/src/app";
import { PageContainer } from "@dagda/client/src/components/container/container.component";
import { Navbar } from "@dagda/client/src/components/navbar/navbar.component";
import { EntitiesStatusComponent } from "@dagda/client/src/components/status/status.component";
import { AppTypes } from "@mqtt-toolbox/shared/src/app/types";
import { APP_CONTEXT_ADAPTER } from "@mqtt-toolbox/shared/src/entities/contexts";
import { APP_MODEL } from "@mqtt-toolbox/shared/src/entities/model";
import { AppPages } from "./pages";
import { StatusPage } from "./pages/status/status.page";

// Referenced so the custom elements are registered before the page is parsed
Navbar;
PageContainer;
EntitiesStatusComponent;

DagdaClient.start<AppTypes, AppPages>({
    title: "MQTT Toolbox",
    model: APP_MODEL,
    contextAdapter: APP_CONTEXT_ADAPTER,
    pages: {
        status: { order: 1, title: "Statut", constructor: StatusPage }
    }
});
