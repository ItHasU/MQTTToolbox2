import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { PreferencesModel } from "@dagda/shared/src/preferences/model";

/**
 * The theme choice (Dagda FEATURES §8, ROADMAP tranche 4) — the first real
 * preference this app declares; the mechanism itself has existed since
 * tranche 3 with nothing using it yet.
 *
 * An enum, not a plain string: the two ids here must match the
 * `[data-theme="…"]` blocks Dagda's own `themes.css` declares (there is no
 * third one for this app to add of its own), so a typo is a compile error,
 * not a theme that silently falls back to the default.
 */
const THEME_ID = EntitiesModel.enum({
    NOCTURNE: { value: "nocturne", label: "Nocturne" },
    AURORE: { value: "aurore", label: "Aurore" }
});

/**
 * Preferences of the application (Dagda FEATURES §11.6).
 *
 * Per-user, read by the client, never global to the instance — a system
 * setting (`shared/src/settings.ts`) is the other half of that split.
 */
export const APP_PREFERENCES = new PreferencesModel({
    "ui.theme": {
        type: THEME_ID,
        default: "nocturne" as const
    }
});

/** Keys of the preferences, for whoever needs to name one */
export type AppPreferences = typeof APP_PREFERENCES extends PreferencesModel<infer D> ? D : never;
