import { StatusPage } from "./pages/status/status.page";

/**
 * The pages of the application: the only thing the framework cannot know.
 * Log, entities and notification are registered by Dagda itself — they were
 * always its own implementations, and wiring them here was pure repetition.
 */
export type AppPages = {
    "status": StatusPage;
};
