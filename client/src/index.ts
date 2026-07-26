import { DagdaClient } from "@dagda/client/src/app";
import { AppTypes } from "@mqtt-toolbox/shared/src/app/types";
import { APP_CONTEXT_ADAPTER } from "@mqtt-toolbox/shared/src/entities/contexts";
import { APP_MODEL } from "@mqtt-toolbox/shared/src/entities/model";
import { registerAppFieldEditors } from "./forms/defaults";
import { AppPages } from "./pages";
import { PublishPage } from "./pages/publish/publish.page";
import { StatusPage } from "./pages/status/status.page";
import { TopicHistoryPage } from "./pages/topic-history/topic-history.page";

// No custom element to reference here any more: the framework registers its
// own, and index.html is down to <dagda-app> (Dagda specs/navigation.md §6.1).

// Before start(): the publish page's template references the default field
// editors as custom elements the moment it renders (Dagda FEATURES §8.1).
registerAppFieldEditors();

DagdaClient.start<AppTypes, AppPages>({
    title: "MQTT Toolbox",
    model: APP_MODEL,
    contextAdapter: APP_CONTEXT_ADAPTER,
    brand: {
        label: "MQTT Toolbox",
        icon: "ph-broadcast"
    },
    // One page in the menu for now, so it stands on its own rather than under
    // a section of one. Sections arrive with the pages that need them.
    pages: {
        // The status page redraws itself when a message changes the topic
        // list, rather than leaving that to the "à rafraîchir" indicator: a
        // handful of rows is cheap to redraw, and this is the screen the
        // real-time requirement (MQTTToolbox §9) is actually about.
        status: { title: "Statut", constructor: StatusPage, icon: "ph-gauge", menu: { order: 1 }, autoRefresh: true },
        // The pending list needs the live queue, same reasoning as the status
        // page above — a scheduled publish firing while the page is open must
        // move the row on its own.
        publish: { title: "Publier", constructor: PublishPage, icon: "ph-paper-plane-tilt", menu: { order: 2 }, autoRefresh: true },
        // Reached from a click on a topic in the status page, never listed:
        // no `menu` here (Dagda specs/navigation.md).
        topicHistory: { title: "Historique du topic", constructor: TopicHistoryPage }
    }
});
