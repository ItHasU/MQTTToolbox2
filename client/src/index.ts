import { DagdaClient } from "@dagda/client/src/app";
import { AppTypes } from "@mqtt-toolbox/shared/src/app/types";
import { APP_CONTEXT_ADAPTER } from "@mqtt-toolbox/shared/src/entities/contexts";
import { APP_MODEL } from "@mqtt-toolbox/shared/src/entities/model";
import { AppPages } from "./pages";
import { StatusPage } from "./pages/status/status.page";

// No custom element to reference here any more: the framework registers its
// own, and index.html is down to <dagda-app> (Dagda specs/navigation.md §6.1).

DagdaClient.start<AppTypes, AppPages>({
    title: "MQTT Toolbox",
    model: APP_MODEL,
    contextAdapter: APP_CONTEXT_ADAPTER,
    brand: {
        label: "MQTT Toolbox",
        // A sigil, not the first letters of the name: "MQ" says nothing.
        compact: "MQTT",
        icon: "ph-broadcast"
    },
    // One page for now, so it stands on its own rather than under a section of
    // one. Sections arrive with the pages that need them.
    pages: {
        status: { title: "Statut", constructor: StatusPage, icon: "ph-gauge", menu: { order: 1 } }
    }
});
