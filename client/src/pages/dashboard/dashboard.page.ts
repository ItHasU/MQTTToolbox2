import { Attribute, Ref } from "@dagda/client/src/components/abstract.webcomponent";
import { DialogAction, openDialog } from "@dagda/client/src/components/dialog/dialog.component";
import { showToast } from "@dagda/client/src/components/toast/toast.component";
import { CodeEditor } from "@dagda/client/src/editor/editor.component";
import { AbstractPageElement } from "@dagda/client/src/pages/abstract.page.element";
import { asNamed } from "@dagda/shared/src/entities/tools/named";
import { DashboardEntity, DashboardShareEntity } from "@mqtt-toolbox/shared/src/entities/types";
import { dagda } from "../../dagda";
// Registers <dagda-code-editor>'s custom element and the five dashboard
// components, side-effect only — the same idiom as registerAppFieldEditors().
import "@dagda/client/src/editor/editor.component";
import "../../dashboard/components";
import "./dashboard.css";
import template from "./dashboard.page.html";

/** A ready-to-insert example, for a dashboard author who does not know the component vocabulary by heart (FEATURES §6) */
interface Snippet {
    label: string;
    html: string;
}

const SNIPPETS: Snippet[] = [
    { label: "Valeur brute", html: '<mqtt-value topic="a/b"></mqtt-value>' },
    { label: "Valeur JSON", html: '<mqtt-json topic="a/b" path="temperature"></mqtt-json>' },
    { label: "Date du dernier message", html: '<mqtt-date topic="a/b"></mqtt-date>' },
    { label: "Ancienneté", html: '<mqtt-age topic="a/b" unit="auto"></mqtt-age>' },
    { label: "Affichage conditionnel", html: '<mqtt-if topic="a/b" path="state" equals="on">\n    Allumé\n</mqtt-if>' },
    { label: "Publier depuis un script", html: '<button onclick="dagda.api.publishMessage({topic: \'a/b\', payload: \'1\'})">Publier</button>' }
];

/**
 * Dashboards: free-form HTML the owner authored, plus the web components of
 * FEATURES §6.1 typed directly into it (Dagda ROADMAP tranche 4).
 *
 * `innerHTML` does not execute `<script>` tags — `_renderHtml()` re-creates
 * them, a deliberate act rather than an accident: a shared dashboard is one
 * user's HTML *and JS* running in another user's browser, which is why
 * `dashboards.edit` (a real permission, not just ownership) gates who may
 * author one at all.
 */
export class DashboardPage extends AbstractPageElement {

    @Ref()
    protected _tabs!: HTMLDivElement;
    @Ref()
    protected _add!: HTMLButtonElement;
    @Ref()
    protected _browse!: HTMLButtonElement;
    @Ref("edit-toggle")
    protected _editToggle!: HTMLButtonElement;
    @Ref()
    protected _leave!: HTMLButtonElement;
    @Ref()
    protected _empty!: HTMLElement;
    @Ref()
    protected _content!: HTMLDivElement;
    @Ref("editor-overlay")
    protected _editorOverlay!: HTMLDivElement;
    @Ref("name-input")
    protected _nameInput!: HTMLInputElement;
    @Ref()
    protected _share!: HTMLButtonElement;
    @Ref()
    protected _delete!: HTMLButtonElement;
    @Ref()
    protected _save!: HTMLButtonElement;
    @Ref("close-editor")
    protected _closeEditor!: HTMLButtonElement;
    @Ref()
    protected _editor!: CodeEditor;
    @Ref()
    protected _preview!: HTMLDivElement;
    @Ref()
    protected _snippets!: HTMLDivElement;

    /** Deep-linked topic id (Dagda ROADMAP tranche 4 routing) — read once, at connection, like every other page's own attribute */
    @Attribute({ name: "dashboard-id" })
    protected _requestedId!: string | null;

    protected _currentId: number | null = null;
    protected _editing = false;
    // Which dashboard's data is currently loaded into the editor inputs —
    // distinct from `_currentId`, which can change (a fetch resolving after
    // the user already started typing) without the user's in-progress edit
    // becoming stale. Resyncing on every `_refresh()` instead of only on a
    // genuine dashboard switch was clobbering fresh edits: `_openEditorOverlay()`
    // shows the overlay synchronously but kicks off `refresh()` unawaited, so
    // a value typed in the gap before that fetch resolves was overwritten by
    // the server's still-old value the moment it landed.
    protected _loadedEditorId: number | null = null;
    // Whether the editor may be opened at all for the currently selected
    // dashboard — review feedback: the edit button must not be available
    // with no dashboard to edit, and only the owner may open the editor for
    // one at all (not just be blocked from saving once inside it).
    protected _canEditCurrent = false;

    protected readonly _onKeyDown = (event: KeyboardEvent): void => {
        if (event.ctrlKey && event.key.toLowerCase() === "e") {
            event.preventDefault();
            this._toggleEditor();
        }
    };

    constructor() {
        super({ template });
    }

    protected override async _init(): Promise<void> {
        // The dashboard's own <script> blocks read this — see mqtt-api.ts.
        (window as unknown as { MQTT: unknown }).MQTT = dagda.mqtt;

        this._add.addEventListener("click", () => this._createDashboard().catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err))));
        this._browse.addEventListener("click", () => this._openBrowseDialog().catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err))));
        this._editToggle.addEventListener("click", () => this._toggleEditor());
        this._leave.addEventListener("click", () => this._confirmLeave());
        this._share.addEventListener("click", () => this._openShareDialog());
        this._delete.addEventListener("click", () => this._confirmDelete());
        this._save.addEventListener("click", () => this._saveCurrent().catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err))));
        this._closeEditor.addEventListener("click", () => this._closeEditorOverlay());
        this._editor.addEventListener("dagda-editor-change", (event) => {
            this._renderHtml(this._preview, (event as CustomEvent<{ value: string }>).detail.value);
        });
        // Cmd/Ctrl+S from inside the editor (review feedback) — same save
        // path as the toolbar's own button.
        this._editor.addEventListener("dagda-editor-save", () => {
            this._saveCurrent().catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
        });
        // Portrait's drawer has its own Ctrl+E-unrelated close triggers
        // (`specs/navigation.md` §4.3) — this is the page's own shortcut,
        // scoped to the document since the editor overlay isn't always
        // focused when the user presses it.
        document.addEventListener("keydown", this._onKeyDown);
        // Swipe between the account's own dashboards (ROADMAP tranche 4) —
        // Dagda has no opinion on what a swipe means, this is that opinion.
        this.addEventListener("dagda-swipe", (event) => {
            this._onSwipe((event as CustomEvent<{ direction: "left" | "right" }>).detail.direction);
        });

        this._renderSnippets();
    }

    public override async dispose(): Promise<void> {
        document.removeEventListener("keydown", this._onKeyDown);
        return super.dispose();
    }

    protected override async _refresh(): Promise<void> {
        const dashboards = await this._loadDashboards();

        if (this._currentId == null || !dashboards.some((d) => d.id === this._currentId)) {
            const requested = this._requestedId != null ? Number(this._requestedId) : null;
            this._currentId = requested != null && dashboards.some((d) => d.id === requested)
                ? requested
                : (dashboards[0]?.id ?? null);
        }

        this._empty.hidden = dashboards.length > 0;
        this._content.hidden = dashboards.length === 0;
        this._renderTabs(dashboards);

        const current = dashboards.find((d) => d.id === this._currentId) ?? null;
        this._renderHtml(this._content, current?.html ?? "");

        this._canEditCurrent = current != null && this._isOwner(current);
        this._editToggle.toggleAttribute("disabled", !this._canEditCurrent);
        // Only the owner may edit a dashboard, but only a non-owner ever
        // needs to leave one — the two buttons are mutually exclusive, never
        // both visible at once.
        this._leave.hidden = current == null || this._isOwner(current);

        if (this._editing) {
            this._applyEditorPermission(current);
            if (this._loadedEditorId !== this._currentId) {
                this._loadedEditorId = this._currentId;
                this._nameInput.value = current?.name ?? "";
                this._editor.value = current?.html ?? "";
                this._renderHtml(this._preview, current?.html ?? "");
            }
        }
    }

    //#region Data ---------------------------------------------------------

    protected async _loadDashboards(): Promise<DashboardEntity[]> {
        const entities = dagda.entities;
        await entities.getHandler().fetch({ type: "dashboards", options: undefined });
        return entities.getHandler().getItems("dashboards").slice().sort((a, b) => a.sortOrder - b.sortOrder);
    }

    protected _currentDashboard(dashboards: DashboardEntity[]): DashboardEntity | null {
        return dashboards.find((d) => d.id === this._currentId) ?? null;
    }

    protected _isOwner(dashboard: DashboardEntity | null): boolean {
        const user = dagda.auth.currentUser;
        return dashboard != null && user != null && (dashboard.ownerId === user.id || user.isSuperAdmin);
    }

    //#endregion

    //#region Rendering ------------------------------------------------------

    protected _renderTabs(dashboards: DashboardEntity[]): void {
        this._tabs.replaceChildren();
        const user = dagda.auth.currentUser;
        for (const dashboard of dashboards) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "dashboard-tab";
            button.setAttribute("role", "tab");
            button.setAttribute("aria-selected", String(dashboard.id === this._currentId));
            if (dashboard.id === this._currentId) {
                button.setAttribute("aria-current", "page");
            }
            // Literal ownership, not `_isOwner()` — a super-admin may edit
            // any dashboard, but that is not what this icon reports; it
            // answers "did I author this one", so an imported dashboard
            // never gets mistaken for one of the caller's own.
            if (dashboard.ownerId !== user?.id) {
                const icon = document.createElement("i");
                icon.className = "ph ph-share-network dashboard-tab-shared-icon";
                icon.setAttribute("aria-hidden", "true");
                icon.title = "Tableau de bord importé — vous n'en êtes pas propriétaire";
                button.appendChild(icon);
            }
            button.appendChild(document.createTextNode(dashboard.name));
            button.addEventListener("click", () => this._select(dashboard.id));
            this._tabs.appendChild(button);
        }
    }

    /**
     * `innerHTML` first, then `<script>` tags are individually re-created —
     * setting `innerHTML` never executes them, by design of the DOM itself,
     * so without this a dashboard's own JS (the JS API, FEATURES §6.2) would
     * simply never run.
     */
    protected _renderHtml(host: HTMLElement, html: string): void {
        host.innerHTML = html;
        for (const old of Array.from(host.querySelectorAll("script"))) {
            const script = document.createElement("script");
            for (const attribute of Array.from(old.attributes)) {
                script.setAttribute(attribute.name, attribute.value);
            }
            script.textContent = old.textContent;
            old.replaceWith(script);
        }
    }

    protected _renderSnippets(): void {
        this._snippets.replaceChildren();
        for (const snippet of SNIPPETS) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "btn btn-ghost dashboard-snippet";
            button.textContent = snippet.label;
            button.addEventListener("click", () => this._insertSnippet(snippet));
            this._snippets.appendChild(button);
        }
    }

    protected _applyEditorPermission(dashboard: DashboardEntity | null): void {
        const editable = this._isOwner(dashboard);
        this._nameInput.toggleAttribute("disabled", !editable);
        this._save.toggleAttribute("disabled", !editable);
        this._delete.toggleAttribute("disabled", !editable);
        this._share.toggleAttribute("disabled", !editable);
    }

    //#endregion

    //#region Navigation -----------------------------------------------------

    protected _select(id: number): void {
        this._currentId = id;
        // Records the choice in the URL without a new history entry — a
        // dashboard is in-page state of the same page, not a navigation
        // (Dagda ROADMAP tranche 4: PageHandler.replaceParams()).
        dagda.pages.replaceParams({ "dashboard-id": String(id) });
        this.refresh().catch((err: unknown) => console.error("Error refreshing the dashboard page", err));
    }

    protected _onSwipe(direction: "left" | "right"): void {
        this._loadDashboards().then((dashboards) => {
            if (dashboards.length < 2 || this._currentId == null) {
                return;
            }
            const index = dashboards.findIndex((d) => d.id === this._currentId);
            if (index < 0) {
                return;
            }
            const nextIndex = direction === "left"
                ? Math.min(index + 1, dashboards.length - 1)
                : Math.max(index - 1, 0);
            if (nextIndex !== index) {
                this._select(dashboards[nextIndex]!.id);
            }
        }).catch((err: unknown) => console.error("Error swiping between dashboards", err));
    }

    //#endregion

    //#region Editing ---------------------------------------------------------

    protected _toggleEditor(): void {
        if (this._editing) {
            this._closeEditorOverlay();
        } else if (this._canEditCurrent) {
            // Guards Ctrl+E too, not just the toolbar button's own `disabled`
            // attribute (which only stops a click) — only the owner may open
            // the editor for a dashboard at all (review feedback), and there
            // must be a dashboard to edit in the first place.
            this._openEditorOverlay().catch((err: unknown) => console.error("Error opening the dashboard editor", err));
        }
    }

    // Awaited by every caller, and the overlay is only revealed once this
    // resolves: `_editing = true` before the fetch would let `_refresh()`
    // sync the inputs from the server while still hidden, but revealing the
    // overlay *before* that sync lands lets a fast edit (real typing, or a
    // Playwright `fill()`) land in the gap and then get silently overwritten
    // the moment the fetch resolves — exactly the bug this replaced.
    protected async _openEditorOverlay(): Promise<void> {
        this._editing = true;
        await this.refresh();
        this._editorOverlay.hidden = false;
    }

    protected _closeEditorOverlay(): void {
        this._editing = false;
        this._editorOverlay.hidden = true;
        // Force a resync next time the overlay opens, even for the same
        // dashboard id — otherwise a save-then-reopen (or an edit abandoned
        // without saving) would see stale inputs from the previous session.
        this._loadedEditorId = null;
    }

    protected _insertSnippet(snippet: Snippet): void {
        this._editor.value = `${this._editor.value ?? ""}\n${snippet.html}\n`;
        this._renderHtml(this._preview, this._editor.value ?? "");
    }

    protected async _createDashboard(): Promise<void> {
        const entities = dagda.entities;
        const handler = entities.getHandler();
        const user = dagda.auth.currentUser;
        const dashboards = await this._loadDashboards();

        let tempId: number | null = null;
        await handler.withTransaction((tr) => {
            // ownerId is never trusted server-side (ServerApp._submit()
            // overwrites it with request.user.id) — the value here only
            // needs to satisfy the client-side type, not be correct.
            const item: DashboardEntity = {
                id: asNamed(0),
                ownerId: asNamed(user?.id ?? 0),
                name: asNamed("Nouveau tableau de bord"),
                html: asNamed("<h1>Nouveau tableau de bord</h1>\n"),
                sortOrder: asNamed(dashboards.length),
                isPublic: asNamed(false)
            };
            tr.insert("dashboards", item);
            // `tr.insert()` only ever assigns a temporary negative id
            // synchronously — the real one is only known once the queued
            // submit() actually resolves, via getUpdatedId() below. Capturing
            // this primitive and using it directly as `_currentId` pointed
            // the editor at whatever dashboard happened to occupy that stale
            // id (or nothing), silently editing the wrong dashboard.
            tempId = item.id;
        });
        await handler.waitForSubmit();

        if (tempId != null) {
            this._currentId = handler.getUpdatedId(asNamed(tempId)) ?? null;
        }
        await this._openEditorOverlay();
    }

    protected async _saveCurrent(): Promise<void> {
        const dashboards = await this._loadDashboards();
        const current = this._currentDashboard(dashboards);
        if (current == null) {
            return;
        }
        const name = this._nameInput.value.trim();
        if (name === "") {
            showToast("Le nom du tableau de bord ne peut pas être vide.");
            return;
        }
        const entities = dagda.entities;
        const handler = entities.getHandler();
        await handler.withTransaction((tr) => {
            tr.update("dashboards", current, { name: asNamed(name), html: asNamed(this._editor.value ?? "") });
        });
        await handler.waitForSubmit();
        showToast("Tableau de bord enregistré.", "success");
        await this.refresh();
    }

    protected _confirmDelete(): void {
        const body = document.createElement("p");
        body.textContent = "Supprimer ce tableau de bord ? Les personnes avec qui il est partagé n'y auront plus accès.";

        const actions: DialogAction[] = [
            { label: "Annuler" },
            {
                label: "Supprimer",
                className: "btn-primary",
                onClick: async () => {
                    const dashboards = await this._loadDashboards();
                    const current = this._currentDashboard(dashboards);
                    if (current == null) {
                        return;
                    }
                    const entities = dagda.entities;
                    const handler = entities.getHandler();
                    await handler.withTransaction((tr) => {
                        tr.delete("dashboards", current.id);
                    });
                    await handler.waitForSubmit();
                    this._currentId = null;
                    this._closeEditorOverlay();
                    await this.refresh();
                }
            }
        ];
        openDialog({ title: "Supprimer le tableau de bord", body, actions });
    }

    /**
     * Self-service "un-import" for a dashboard the caller does not own
     * (bug fix: there was previously no way to leave one at all — the
     * owner-only share dialog was the sole path to removing a
     * `dashboard_shares` row, and a non-owner cannot open it, or even the
     * editor overlay it lives in).
     */
    protected _confirmLeave(): void {
        const body = document.createElement("p");
        body.textContent = "Quitter ce tableau de bord ? Vous ne le verrez plus dans votre liste, mais pourrez l'importer de nouveau depuis « Parcourir » tant qu'il reste public.";

        const actions: DialogAction[] = [
            { label: "Annuler" },
            {
                label: "Quitter",
                className: "btn-primary",
                onClick: async () => {
                    const dashboards = await this._loadDashboards();
                    const current = this._currentDashboard(dashboards);
                    const user = dagda.auth.currentUser;
                    if (current == null || user == null) {
                        return;
                    }
                    const entities = dagda.entities;
                    const myShare = entities.getHandler().getItems("dashboard_shares")
                        .find((s) => s.dashboardId === current.id && s.userId === user.id);
                    if (myShare == null) {
                        return;
                    }
                    await this._unshare(myShare);
                    this._currentId = null;
                    await this.refresh();
                }
            }
        ];
        openDialog({ title: "Quitter le tableau de bord", body, actions });
    }

    //#endregion

    //#region Sharing ---------------------------------------------------------

    /**
     * Owner view only (reachable exclusively through the toolbar's own
     * "Partager" button, itself disabled for a non-owner by
     * `_applyEditorPermission`): a public/private toggle, plus a read-only
     * list of who has imported it so far. No more per-user picker — review
     * feedback reworked sharing from "owner targets a specific recipient" to
     * "owner publishes, everyone else opts in" (see `_openBrowseDialog`).
     */
    protected async _openShareDialog(): Promise<void> {
        const dashboards = await this._loadDashboards();
        const current = this._currentDashboard(dashboards);
        if (current == null) {
            return;
        }

        const entities = dagda.entities;
        const shares = entities.getHandler().getItems("dashboard_shares").filter((s) => s.dashboardId === current.id);
        const users = dagda.users;

        const body = document.createElement("div");

        const toggleField = document.createElement("label");
        toggleField.className = "dashboard-public-toggle";
        const toggle = document.createElement("input");
        toggle.type = "checkbox";
        toggle.checked = current.isPublic;
        toggleField.append(toggle, document.createTextNode(" Public — visible par tout le monde, à importer depuis « Parcourir »"));
        toggle.addEventListener("change", () => {
            this._setPublic(current, toggle.checked).catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
        });
        body.appendChild(toggleField);

        const intro = document.createElement("p");
        intro.className = "text-muted";
        intro.textContent = shares.length === 0 ? "Personne ne l'a encore importé." : "Importé par :";
        body.appendChild(intro);

        const list = document.createElement("ul");
        list.className = "dashboard-share-list";
        for (const share of shares) {
            const item = document.createElement("li");
            item.textContent = users.getDisplayName(share.userId) ?? `#${share.userId}`;
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "btn btn-ghost btn-icon";
            remove.setAttribute("aria-label", "Retirer l'accès");
            const icon = document.createElement("i");
            icon.className = "ph ph-x";
            icon.setAttribute("aria-hidden", "true");
            remove.appendChild(icon);
            remove.addEventListener("click", () => {
                this._unshare(share).catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
            });
            item.appendChild(remove);
            list.appendChild(item);
        }
        body.appendChild(list);

        const actions: DialogAction[] = [{ label: "Fermer" }];
        openDialog({ title: `Partager « ${current.name} »`, body, actions });
    }

    protected async _setPublic(dashboard: DashboardEntity, isPublic: boolean): Promise<void> {
        const entities = dagda.entities;
        const handler = entities.getHandler();
        await handler.withTransaction((tr) => {
            tr.update("dashboards", dashboard, { isPublic: asNamed(isPublic) });
        });
        await handler.waitForSubmit();
        showToast(isPublic ? "Tableau de bord rendu public." : "Tableau de bord rendu privé.", "success");
        await this.refresh();
    }

    protected async _unshare(share: DashboardShareEntity): Promise<void> {
        const entities = dagda.entities;
        const handler = entities.getHandler();
        await handler.withTransaction((tr) => {
            tr.delete("dashboard_shares", share.id);
        });
        await handler.waitForSubmit();
        // Deleting a `dashboard_shares` row can change whether a *different*
        // table's row (the `dashboards` entry itself) still belongs in this
        // session's view — a relationship the generic entities cache has no
        // way to know about on its own. The server tells every *other*
        // session via `contextChanged`, but the writer's own session is
        // deliberately excluded from that echo (self-echo suppression, ROADMAP
        // tranche 4's notification-leak fix), so without this the caller's
        // own `dashboards` fetch stays marked "not dirty" and a subsequent
        // fetch() is skipped entirely — leaving the just-left dashboard
        // stuck in the tab list until something else happens to dirty it.
        handler.markCacheDirty();
        showToast("Partage retiré.", "success");
    }

    /**
     * Public dashboards the caller neither owns nor has already imported —
     * open to any authenticated account, same posture as viewing a
     * dashboard shared this way has always had (no permission needed).
     */
    protected async _openBrowseDialog(): Promise<void> {
        const entities = dagda.entities;
        const handler = entities.getHandler();
        await handler.fetch({ type: "publicDashboards", options: undefined });
        const user = dagda.auth.currentUser;
        // `getItems("dashboards")` reads the whole shared entity cache, not
        // just what this fetch just returned — it still holds every
        // dashboard an earlier `{type: "dashboards"}` fetch cached, owned or
        // already-imported ones included. The server's own `publicDashboards`
        // query already excludes both, but that filtering is lost the moment
        // this reads the cache instead of that query's actual result, so it
        // has to be redone here explicitly (this was the "I see my own
        // dashboards in Parcourir" bug).
        const alreadyImported = new Set(
            handler.getItems("dashboard_shares")
                .filter((s) => s.userId === user?.id)
                .map((s) => s.dashboardId)
        );
        const candidates = handler.getItems("dashboards")
            .filter((d) => d.isPublic && d.ownerId !== user?.id && !alreadyImported.has(d.id))
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name));

        const body = document.createElement("div");
        if (candidates.length === 0) {
            const empty = document.createElement("p");
            empty.className = "text-muted";
            empty.textContent = "Aucun tableau de bord public à importer pour l'instant.";
            body.appendChild(empty);
        } else {
            const list = document.createElement("ul");
            list.className = "dashboard-share-list";
            for (const dashboard of candidates) {
                const item = document.createElement("li");
                item.textContent = dashboard.name;
                const importButton = document.createElement("button");
                importButton.type = "button";
                importButton.className = "btn btn-ghost";
                importButton.textContent = "Importer";
                importButton.addEventListener("click", () => {
                    this._importDashboard(dashboard).catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
                });
                item.appendChild(importButton);
                list.appendChild(item);
            }
            body.appendChild(list);
        }

        openDialog({ title: "Parcourir les tableaux de bord publics", body, actions: [{ label: "Fermer" }] });
    }

    protected async _importDashboard(dashboard: DashboardEntity): Promise<void> {
        const user = dagda.auth.currentUser;
        if (user == null) {
            return;
        }
        const entities = dagda.entities;
        const handler = entities.getHandler();
        await handler.withTransaction((tr) => {
            const item: DashboardShareEntity = {
                id: asNamed(0),
                dashboardId: dashboard.id,
                userId: asNamed(user.id)
            };
            tr.insert("dashboard_shares", item);
        });
        await handler.waitForSubmit();
        showToast(`« ${dashboard.name} » importé.`, "success");
        await this.refresh();
    }

    //#endregion

}
customElements.define("dashboard-page", DashboardPage);
