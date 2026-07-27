import { DagdaClient } from "@dagda/client/src/app";
import { AppTypes } from "@mqtt-toolbox/shared/src/app/types";
import { APP_CONTEXT_ADAPTER } from "@mqtt-toolbox/shared/src/entities/contexts";
import { APP_MODEL } from "@mqtt-toolbox/shared/src/entities/model";
import { APP_SETTINGS } from "@mqtt-toolbox/shared/src/settings";
import { MqttApi } from "./dashboard/mqtt-api";
import { registerAppFieldEditors } from "./forms/defaults";
import { AppPages } from "./pages";
import { DashboardPage } from "./pages/dashboard/dashboard.page";
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
    // Theme choice, remembered per account (Dagda FEATURES §11.6, ROADMAP
    // tranche 4) — the app's own list stays the framework's default
    // (nocturne/aurore), only the storage key is app-specific.
    themePreferenceKey: "ui.theme",
    // System settings (Dagda FEATURES §11.5) — presence alone is what makes
    // the framework register its default Settings page (Dagda
    // pages/defaults.ts); no local Settings entry needed in `pages:` below.
    settings: APP_SETTINGS,
    // The dashboard JS API (Dagda ROADMAP tranche 4, FEATURES §6.2) — one
    // instance for the whole session, reachable via Dagda.get("mqtt") from
    // any component, loaded lazily (ensureLoaded()) the first time a
    // dashboard actually needs it rather than at bootstrap.
    services: {
        mqtt: new MqttApi()
    },
    // One page in the menu for now, so it stands on its own rather than under
    // a section of one. Sections arrive with the pages that need them.
    pages: {
        // "C'est la fonctionnalité centrale de l'outil" (FEATURES §6) — first
        // in the menu, so it's the default page (PageHandler.getDefaultPageUID()
        // is the first entry). No autoRefresh: it has its own editing mode
        // (Ctrl+E), and a page mid-edit is not cheap to redraw out from under
        // the user — live values inside a dashboard update on their own,
        // through each component's own MqttApi subscription, not through the
        // page's own _refresh().
        dashboard: { title: "Tableaux de bord", constructor: DashboardPage, icon: "ph-squares-four", menu: { order: 0 } },
        // The status page redraws itself when a message changes the topic
        // list, rather than leaving that to the "à rafraîchir" indicator: a
        // handful of rows is cheap to redraw, and this is the screen the
        // real-time requirement (MQTTToolbox §9) is actually about.
        status: { title: "Statut", constructor: StatusPage, icon: "ph-gauge", menu: { order: 1 }, autoRefresh: true },
        // The pending list needs the live queue, same reasoning as the status
        // page above — a scheduled publish firing while the page is open must
        // move the row on its own. Gated server-side too (review feedback):
        // hiding the entry is convenience, not the access check — the same
        // posture roles/users/settings already take below.
        publish: { title: "Publier", constructor: PublishPage, icon: "ph-paper-plane-tilt", menu: { order: 2 }, autoRefresh: true, permission: "publish.send" },
        // Reached from a click on a topic in the status page, never listed:
        // no `menu` here (Dagda specs/navigation.md). `autoRefresh` so a
        // message arriving on the open topic redraws the table itself,
        // same reasoning as the status page — a handful of rows is cheap
        // to redraw on every change.
        topicHistory: { title: "Historique du topic", constructor: TopicHistoryPage, autoRefresh: true }
        // Rôles/Utilisateurs/Paramètres/Préférences: registered automatically
        // by the framework (Dagda pages/defaults.ts) — nothing to declare
        // here unless overriding one of them (icon, menu order, ...).
    }
});
