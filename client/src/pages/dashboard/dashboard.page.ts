import { actionCall } from "@dagda/client/src/actions";
import { Attribute, Ref } from "@dagda/client/src/components/abstract.webcomponent";
import { DialogAction, openDialog } from "@dagda/client/src/components/dialog/dialog.component";
import { showToast } from "@dagda/client/src/components/toast/toast.component";
import { CodeEditor } from "@dagda/client/src/editor/editor.component";
import { AuthService } from "@dagda/client/src/auth/auth.service";
import { AbstractPageElement } from "@dagda/client/src/pages/abstract.page.element";
import { PageService } from "@dagda/client/src/pages/service";
import { UsersService } from "@dagda/client/src/auth/service";
import { DagdaActions } from "@dagda/shared/src/auth/actions";
import { Dagda } from "@dagda/shared/src/dagda";
import { EntitiesService } from "@dagda/shared/src/entities/service";
import { asNamed } from "@dagda/shared/src/entities/tools/named";
import { AppContexts } from "@mqtt-toolbox/shared/src/entities/contexts";
import { AppEntityTypes, DashboardEntity, DashboardShareEntity } from "@mqtt-toolbox/shared/src/entities/types";
import { MqttService } from "../../dashboard/mqtt-api";
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
    { label: "Publier depuis un script", html: '<button onclick="dagda.routes.publishMessage({topic: \'a/b\', payload: \'1\'})">Publier</button>' }
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
    @Ref("edit-toggle")
    protected _editToggle!: HTMLButtonElement;
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
        (window as unknown as { MQTT: unknown }).MQTT = Dagda.get<MqttService>("mqtt");

        this._add.addEventListener("click", () => this._createDashboard().catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err))));
        this._editToggle.addEventListener("click", () => this._toggleEditor());
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
        const entities = Dagda.get<EntitiesService<AppEntityTypes, AppContexts>>("entities");
        await entities.getHandler().fetch({ type: "dashboards", options: undefined });
        return entities.getHandler().getItems("dashboards").slice().sort((a, b) => a.sortOrder - b.sortOrder);
    }

    protected _currentDashboard(dashboards: DashboardEntity[]): DashboardEntity | null {
        return dashboards.find((d) => d.id === this._currentId) ?? null;
    }

    protected _isOwner(dashboard: DashboardEntity | null): boolean {
        const user = Dagda.get<AuthService>("auth").currentUser;
        return dashboard != null && user != null && (dashboard.ownerId === user.id || user.isSuperAdmin);
    }

    //#endregion

    //#region Rendering ------------------------------------------------------

    protected _renderTabs(dashboards: DashboardEntity[]): void {
        this._tabs.replaceChildren();
        for (const dashboard of dashboards) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "dashboard-tab";
            button.setAttribute("role", "tab");
            button.setAttribute("aria-selected", String(dashboard.id === this._currentId));
            if (dashboard.id === this._currentId) {
                button.setAttribute("aria-current", "page");
            }
            button.textContent = dashboard.name;
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
        Dagda.get<PageService>("pages").replaceParams({ "dashboard-id": String(id) });
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
        } else {
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
        const entities = Dagda.get<EntitiesService<AppEntityTypes, AppContexts>>("entities");
        const handler = entities.getHandler();
        const user = Dagda.get<AuthService>("auth").currentUser;
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
                sortOrder: asNamed(dashboards.length)
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
        const entities = Dagda.get<EntitiesService<AppEntityTypes, AppContexts>>("entities");
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
                    const entities = Dagda.get<EntitiesService<AppEntityTypes, AppContexts>>("entities");
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

    //#endregion

    //#region Sharing ---------------------------------------------------------

    protected async _openShareDialog(): Promise<void> {
        const dashboards = await this._loadDashboards();
        const current = this._currentDashboard(dashboards);
        if (current == null) {
            return;
        }

        const entities = Dagda.get<EntitiesService<AppEntityTypes, AppContexts>>("entities");
        const shares = entities.getHandler().getItems("dashboard_shares").filter((s) => s.dashboardId === current.id);
        const users = Dagda.get<UsersService>("users");
        const everyone = await actionCall<DagdaActions, "listUserNames">("listUserNames");
        const sharedUserIds = new Set(shares.map((s) => s.userId));
        const candidates = everyone.filter((u) => u.id !== current.ownerId && !sharedUserIds.has(asNamed(u.id)));

        const body = document.createElement("div");

        const list = document.createElement("ul");
        list.className = "dashboard-share-list";
        for (const share of shares) {
            const item = document.createElement("li");
            item.textContent = users.getDisplayName(share.userId) ?? `#${share.userId}`;
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "btn btn-ghost btn-icon";
            remove.setAttribute("aria-label", "Retirer le partage");
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

        const select = document.createElement("select");
        select.className = "input";
        for (const candidate of candidates) {
            const option = document.createElement("option");
            option.value = String(candidate.id);
            option.textContent = candidate.displayName;
            select.appendChild(option);
        }
        body.appendChild(select);

        const actions: DialogAction[] = [
            { label: "Fermer" },
            {
                label: "Partager",
                className: "btn-primary",
                onClick: async (): Promise<false> => {
                    const userId = Number(select.value);
                    if (Number.isFinite(userId)) {
                        await this._shareWith(current, userId);
                    }
                    return false; // stays open — sharing with a second person is a likely next step
                }
            }
        ];
        openDialog({ title: `Partager « ${current.name} »`, body, actions });
    }

    protected async _shareWith(dashboard: DashboardEntity, userId: number): Promise<void> {
        const entities = Dagda.get<EntitiesService<AppEntityTypes, AppContexts>>("entities");
        const handler = entities.getHandler();
        await handler.withTransaction((tr) => {
            const item: DashboardShareEntity = {
                id: asNamed(0),
                dashboardId: dashboard.id,
                userId: asNamed(userId)
            };
            tr.insert("dashboard_shares", item);
        });
        await handler.waitForSubmit();
        showToast("Tableau de bord partagé.", "success");
    }

    protected async _unshare(share: DashboardShareEntity): Promise<void> {
        const entities = Dagda.get<EntitiesService<AppEntityTypes, AppContexts>>("entities");
        const handler = entities.getHandler();
        await handler.withTransaction((tr) => {
            tr.delete("dashboard_shares", share.id);
        });
        await handler.waitForSubmit();
        showToast("Partage retiré.", "success");
    }

    //#endregion

}
customElements.define("dashboard-page", DashboardPage);
