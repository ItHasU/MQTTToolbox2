import { DashboardPage } from "./pages/dashboard/dashboard.page";
import { PreferencesPage } from "./pages/preferences/preferences.page";
import { PublishPage } from "./pages/publish/publish.page";
import { RolesPage } from "./pages/roles/roles.page";
import { SettingsPage } from "./pages/settings/settings.page";
import { StatusPage } from "./pages/status/status.page";
import { TopicHistoryPage } from "./pages/topic-history/topic-history.page";
import { UsersPage } from "./pages/users/users.page";

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
