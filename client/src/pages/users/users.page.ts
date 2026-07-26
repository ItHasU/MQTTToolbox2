import { actionCall } from "@dagda/client/src/actions";
import { Ref } from "@dagda/client/src/components/abstract.webcomponent";
import { DialogAction, openDialog } from "@dagda/client/src/components/dialog/dialog.component";
import { showToast } from "@dagda/client/src/components/toast/toast.component";
import { defaultFieldEditors, FieldEditor } from "@dagda/client/src/forms/editors";
import { AbstractPageElement } from "@dagda/client/src/pages/abstract.page.element";
import { DagdaActions, InvitationResult } from "@dagda/shared/src/auth/actions";
import { Role, UserInfo } from "@dagda/shared/src/auth/types";
import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { JSTypes } from "@dagda/shared/src/entities/tools/javascript.types";
import template from "./users.page.html";

const BOOLEAN_TYPE = EntitiesModel.type({ rawType: JSTypes.boolean });
const STRING_TYPE = EntitiesModel.type({ rawType: JSTypes.string });

function booleanEditor(value: boolean): FieldEditor<boolean> {
    const editor = defaultFieldEditors.createEditor(BOOLEAN_TYPE) as FieldEditor<boolean>;
    editor.value = value;
    return editor;
}

function textEditor(value: string): FieldEditor<string> {
    const editor = defaultFieldEditors.createEditor(STRING_TYPE) as FieldEditor<string>;
    editor.value = value;
    return editor;
}

/** The native checkbox inside a boolean editor — the element that actually fires "change" */
function checkboxInput(editor: FieldEditor<boolean>): HTMLInputElement {
    return editor.querySelector("input")!;
}

/**
 * Account administration and role assignment (Dagda FEATURES §7, §7.1),
 * the screen `dagda.actions.inviteUser/reinviteUser/listUsers/
 * setUserEnabled/setUserRole` were, until now, only reachable from.
 *
 * No email service (FEATURES §0): inviting or reinviting hands back a link
 * with nowhere of its own to go, so both open a dialog with the link ready
 * to copy — the one thing an administrator must do by hand for either.
 */
export class UsersPage extends AbstractPageElement {

    @Ref()
    protected _invite!: HTMLButtonElement;
    @Ref()
    protected _rows!: HTMLTableSectionElement;

    protected _users: UserInfo[] = [];
    protected _roles: Role[] = [];

    constructor() {
        super({ template });
    }

    protected override async _init(): Promise<void> {
        this._invite.addEventListener("click", () => this._openInviteDialog());
    }

    protected override async _refresh(): Promise<void> {
        try {
            [this._users, this._roles] = await Promise.all([
                actionCall<DagdaActions, "listUsers">("listUsers"),
                actionCall<DagdaActions, "listRoles">("listRoles")
            ]);
        } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
            return;
        }
        this._renderRows();
    }

    protected _renderRows(): void {
        this._rows.replaceChildren();
        for (const user of this._users) {
            const row = document.createElement("tr");

            const account = document.createElement("td");
            const login = document.createElement("div");
            login.textContent = user.login;
            account.appendChild(login);
            if (user.displayName !== user.login) {
                const displayName = document.createElement("div");
                displayName.className = "text-muted";
                displayName.textContent = user.displayName;
                account.appendChild(displayName);
            }
            if (user.isSuperAdmin) {
                const tag = document.createElement("span");
                tag.className = "tag tag-accent";
                tag.textContent = "Super-admin";
                account.appendChild(tag);
            }
            row.appendChild(account);

            const roleCell = document.createElement("td");
            roleCell.appendChild(this._buildRoleSelect(user));
            row.appendChild(roleCell);

            const enabledCell = document.createElement("td");
            const enabledEditor = booleanEditor(user.enabled);
            checkboxInput(enabledEditor).addEventListener("change", () => {
                actionCall<DagdaActions, "setUserEnabled">("setUserEnabled", { id: user.id, enabled: enabledEditor.value === true })
                    .then(() => this.refresh())
                    .catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
            });
            enabledCell.appendChild(enabledEditor);
            row.appendChild(enabledCell);

            const actionsCell = document.createElement("td");
            const reinvite = document.createElement("button");
            reinvite.type = "button";
            reinvite.className = "btn btn-ghost";
            reinvite.textContent = "Réinviter";
            reinvite.title = "Envoie un nouveau lien : sert aussi bien à finir une invitation qu'à réinitialiser un mot de passe.";
            reinvite.addEventListener("click", () => {
                actionCall<DagdaActions, "reinviteUser">("reinviteUser", { id: user.id })
                    .then((result) => this._showInvitationDialog(result))
                    .catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
            });
            actionsCell.appendChild(reinvite);
            row.appendChild(actionsCell);

            this._rows.appendChild(row);
        }
    }

    protected _buildRoleSelect(user: UserInfo): HTMLSelectElement {
        const select = document.createElement("select");
        select.className = "input";

        const none = document.createElement("option");
        none.value = "";
        none.textContent = "Aucun rôle";
        select.appendChild(none);

        for (const role of this._roles) {
            const option = document.createElement("option");
            option.value = String(role.id);
            option.textContent = role.name;
            select.appendChild(option);
        }
        select.value = user.roleId == null ? "" : String(user.roleId);

        select.addEventListener("change", () => {
            const roleId = select.value === "" ? null : Number(select.value);
            actionCall<DagdaActions, "setUserRole">("setUserRole", { id: user.id, roleId })
                .then(() => this.refresh())
                .catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
        });

        return select;
    }

    protected _openInviteDialog(): void {
        const body = document.createElement("div");

        const loginField = document.createElement("div");
        loginField.className = "field";
        const loginLabel = document.createElement("label");
        loginLabel.textContent = "Identifiant";
        const loginEditor = textEditor("");
        loginField.append(loginLabel, loginEditor);
        body.appendChild(loginField);

        const nameField = document.createElement("div");
        nameField.className = "field";
        const nameLabel = document.createElement("label");
        nameLabel.textContent = "Nom affiché";
        const nameEditor = textEditor("");
        nameField.append(nameLabel, nameEditor);
        body.appendChild(nameField);

        const adminField = document.createElement("div");
        adminField.className = "field";
        const adminLabel = document.createElement("span");
        adminLabel.className = "text-muted";
        adminLabel.textContent = "Super-administrateur";
        const adminEditor = booleanEditor(false);
        adminField.append(adminLabel, adminEditor);
        body.appendChild(adminField);

        const actions: DialogAction[] = [
            { label: "Annuler" },
            {
                label: "Inviter",
                className: "btn-primary",
                onClick: async (): Promise<false> => {
                    const login = loginEditor.value?.trim() ?? "";
                    if (login === "") {
                        throw new Error("L'identifiant ne peut pas être vide.");
                    }
                    const displayName = nameEditor.value?.trim();
                    const result = await actionCall<DagdaActions, "inviteUser">("inviteUser", {
                        login,
                        displayName: displayName === "" ? undefined : displayName,
                        isSuperAdmin: adminEditor.value === true
                    });
                    await this.refresh();
                    this._showInvitationDialog(result);
                    return false; // the dialog just opened above must not be closed right behind it
                }
            }
        ];
        openDialog({ title: "Inviter un utilisateur", body, actions });
    }

    /** Shown after inviteUser/reinviteUser: the link has nowhere else to go (no mail service, FEATURES §0) */
    protected _showInvitationDialog(result: InvitationResult): void {
        const body = document.createElement("div");

        const intro = document.createElement("p");
        intro.textContent = `Lien à transmettre à ${result.user.displayName}, valable jusqu'au ${new Date(result.expiresAt).toLocaleString()} :`;
        body.appendChild(intro);

        const field = document.createElement("div");
        field.className = "field";
        const link = document.createElement("input");
        link.className = "input";
        link.type = "text";
        link.readOnly = true;
        link.value = result.url;
        field.appendChild(link);
        body.appendChild(field);

        const actions: DialogAction[] = [
            {
                label: "Copier le lien",
                className: "btn-primary",
                onClick: () => {
                    link.select();
                    navigator.clipboard?.writeText(result.url)
                        .then(() => showToast("Lien copié."))
                        .catch(() => { /* still selected, for a manual copy */ });
                    return false; // stays open — closing on copy would rush the admin past it
                }
            },
            { label: "Fermer" }
        ];
        openDialog({ title: "Invitation", body, actions });
        link.focus();
        link.select();
    }

}
customElements.define("users-page", UsersPage);
