import { Ref } from "@dagda/client/src/components/abstract.webcomponent";
import { AbstractPageElement } from "@dagda/client/src/pages/abstract.page.element";
import { showToast } from "@dagda/client/src/components/toast/toast.component";
import { ThemeService } from "@dagda/client/src/themes/service";
import { Dagda } from "@dagda/shared/src/dagda";
import template from "./preferences.page.html";

/**
 * Per-user preferences (Dagda FEATURES §11.6, ROADMAP tranche 4) — the theme
 * choice is the first one, `<dagda-form>` isn't a fit for it: a theme
 * applies the moment it's picked, not on a submit button, the same
 * instant-feedback UX any theme switcher needs.
 */
export class PreferencesPage extends AbstractPageElement {

    @Ref()
    protected _themes!: HTMLDivElement;

    constructor() {
        super({ template });
    }

    protected override async _refresh(): Promise<void> {
        const themes = Dagda.get<ThemeService>("themes");
        const current = themes.current;

        this._themes.replaceChildren();
        for (const theme of themes.list()) {
            const label = document.createElement("label");
            label.className = "seg-opt";

            const input = document.createElement("input");
            input.type = "radio";
            input.name = "theme";
            input.value = theme.id;
            input.checked = theme.id === current;
            input.addEventListener("change", () => {
                themes.set(theme.id).catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
            });
            label.appendChild(input);
            label.appendChild(document.createTextNode(theme.label));

            this._themes.appendChild(label);
        }
    }

}
customElements.define("preferences-page", PreferencesPage);
