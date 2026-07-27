import { DashboardPage } from "./pages/dashboard/dashboard.page";
import { PublishPage } from "./pages/publish/publish.page";
import { StatusPage } from "./pages/status/status.page";
import { TopicHistoryPage } from "./pages/topic-history/topic-history.page";

/**
 * The pages of the application: the only thing the framework cannot know.
 * Log, entities and notification are registered by Dagda itself — they were
 * always its own implementations, and wiring them here was pure repetition.
 * Rôles/Utilisateurs/Paramètres/Préférences aren't declared here either:
 * Dagda registers them automatically (`pages/defaults.ts`), review feedback
 * on the previous refactor pass — a new project should not have to
 * re-import and re-register them just to get them back.
 */
export type AppPages = {
    "dashboard": DashboardPage;
    "status": StatusPage;
    "topicHistory": TopicHistoryPage;
    "publish": PublishPage;
};
