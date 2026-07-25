import { DagdaClient } from "@dagda/client/src/app";
import { PageContainer } from "@dagda/client/src/components/container/container.component";
import { Navbar } from "@dagda/client/src/components/navbar/navbar.component";
import { EntitiesStatusComponent } from "@dagda/client/src/components/status/status.component";
import { AppTypes } from "@mqtt-toolbox/shared/src/app/types";
import { AppContextAdapter } from "@mqtt-toolbox/shared/src/entities/contexts";
import { APP_MODEL } from "@mqtt-toolbox/shared/src/entities/model";
import { initServices } from "./services";

// Referenced so the custom elements are registered before the page is parsed
Navbar;
PageContainer;
EntitiesStatusComponent;

// Services first: the bootstrap and every component reach them with Dagda.get()
initServices();

DagdaClient.start<AppTypes>(APP_MODEL, new AppContextAdapter());
