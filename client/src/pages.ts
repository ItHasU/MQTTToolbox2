import { PreferencesPage } from "@dagda/client/src/pages/preferences/preferences.page";
import { RolesPage } from "@dagda/client/src/pages/roles/roles.page";
import { SettingsPage } from "@dagda/client/src/pages/settings/settings.page";
import { UsersPage } from "@dagda/client/src/pages/users/users.page";
import { DashboardPage } from "./pages/dashboard/dashboard.page";
import { PublishPage } from "./pages/publish/publish.page";
import { StatusPage } from "./pages/status/status.page";
import { TopicHistoryPage } from "./pages/topic-history/topic-history.page";

/**
 * The pages of the application: the only thing the framework cannot know.
 * Log, entities and notification are registered by Dagda itself — they were
 * always its own implementations, and wiring them here was pure repetition.
 */
export type AppPages = {
    "dashboard": DashboardPage;
    "status": StatusPage;
    "topicHistory": TopicHistoryPage;
    "publish": PublishPage;
    "roles": RolesPage;
    "users": UsersPage;
    "settings": SettingsPage;
    "preferences": PreferencesPage;
};
