import { actionCall } from "@dagda/client/src/actions";
import { Ref } from "@dagda/client/src/components/abstract.webcomponent";
import { DialogAction, openDialog } from "@dagda/client/src/components/dialog/dialog.component";
import { showToast } from "@dagda/client/src/components/toast/toast.component";
import { defaultFieldEditors, FieldEditor } from "@dagda/client/src/forms/editors";
import { AbstractPageElement } from "@dagda/client/src/pages/abstract.page.element";
import { DagdaActions } from "@dagda/shared/src/auth/actions";
import { DAGDA_PERMISSIONS } from "@dagda/shared/src/auth/permissions";
import { Role } from "@dagda/shared/src/auth/types";
import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { JSTypes } from "@dagda/shared/src/entities/tools/javascript.types";
import template from "./roles.page.html";

const PERMISSION_KEYS = Object.keys(DAGDA_PERMISSIONS) as (keyof typeof DAGDA_PERMISSIONS)[];
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
 * The role × permission matrix (Dagda FEATURES §7.1, ROADMAP tranche 3): one
 * column per role, one row per declared permission, a checkbox at each
 * intersection saved as soon as it is toggled.
 *
 * Creating and deleting a role both happen from the column header — a role
 * is fundamentally a column of this table, so that is where it is born and
 * where it goes. Creation opens a dialog (Dagda FEATURES §8): the matrix has
 * no room for a name field once there are several roles, and a role without
 * one is not meaningful even for an instant. Deletion asks for confirmation:
 * it also clears the role from every account that carries it (the framework
 * migration's `ON DELETE SET NULL`, not something this page does itself),
 * which is worth a second thought before confirming.
 */
export class RolesPage extends AbstractPageElement {

    @Ref()
    protected _head!: HTMLTableSectionElement;
    @Ref()
    protected _rows!: HTMLTableSectionElement;

    protected _roles: Role[] = [];

    constructor() {
        super({ template });
    }

    protected override async _refresh(): Promise<void> {
        try {
            this._roles = await actionCall<DagdaActions, "listRoles">("listRoles");
        } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
            return;
        }
        this._renderHead();
        this._renderRows();
    }

    protected _renderHead(): void {
        const row = document.createElement("tr");

        const permissionHeader = document.createElement("th");
        permissionHeader.textContent = "Permission";
        row.appendChild(permissionHeader);

        for (const role of this._roles) {
            const th = document.createElement("th");

            const name = document.createElement("div");
            name.textContent = role.name;
            th.appendChild(name);

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "btn btn-ghost btn-icon";
            remove.setAttribute("aria-label", `Supprimer le rôle « ${role.name} »`);
            const removeIcon = document.createElement("i");
            removeIcon.className = "ph ph-trash";
            removeIcon.setAttribute("aria-hidden", "true");
            remove.appendChild(removeIcon);
            remove.addEventListener("click", () => this._confirmDelete(role));
            th.appendChild(remove);

            row.appendChild(th);
        }

        const create = document.createElement("th");
        const createButton = document.createElement("button");
        createButton.type = "button";
        createButton.className = "btn btn-ghost btn-icon";
        createButton.setAttribute("aria-label", "Créer un rôle");
        const createIcon = document.createElement("i");
        createIcon.className = "ph ph-plus";
        createIcon.setAttribute("aria-hidden", "true");
        createButton.appendChild(createIcon);
        createButton.addEventListener("click", () => this._openCreateDialog());
        create.appendChild(createButton);
        row.appendChild(create);

        this._head.replaceChildren(row);
    }

    protected _renderRows(): void {
        this._rows.replaceChildren();
        for (const key of PERMISSION_KEYS) {
            const row = document.createElement("tr");

            const label = document.createElement("td");
            label.textContent = DAGDA_PERMISSIONS[key].label;
            label.title = DAGDA_PERMISSIONS[key].description ?? "";
            row.appendChild(label);

            for (const role of this._roles) {
                const cell = document.createElement("td");
                const editor = booleanEditor(role.permissions.includes(key));
                checkboxInput(editor).addEventListener("change", () => {
                    this._togglePermission(role, key, editor.value === true)
                        .catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
                });
                cell.appendChild(editor);
                row.appendChild(cell);
            }

            row.appendChild(document.createElement("td")); // under the "+" column, nothing to show
            this._rows.appendChild(row);
        }
    }

    protected async _togglePermission(role: Role, key: string, checked: boolean): Promise<void> {
        const permissions = checked
            ? [...role.permissions, key]
            : role.permissions.filter(p => p !== key);
        await actionCall<DagdaActions, "updateRole">("updateRole", { id: role.id, permissions });
        await this.refresh();
    }

    protected _openCreateDialog(): void {
        const body = document.createElement("div");

        const nameField = document.createElement("div");
        nameField.className = "field";
        const nameLabel = document.createElement("label");
        nameLabel.textContent = "Nom";
        const nameEditor = textEditor("");
        nameField.append(nameLabel, nameEditor);
        body.appendChild(nameField);

        const permissionEditors = new Map<string, FieldEditor<boolean>>();
        for (const key of PERMISSION_KEYS) {
            const field = document.createElement("div");
            field.className = "field";
            const permissionLabel = document.createElement("span");
            permissionLabel.className = "text-muted";
            permissionLabel.textContent = DAGDA_PERMISSIONS[key].label;
            const editor = booleanEditor(false);
            permissionEditors.set(key, editor);
            field.append(permissionLabel, editor);
            body.appendChild(field);
        }

        const actions: DialogAction[] = [
            { label: "Annuler" },
            {
                label: "Créer",
                className: "btn-primary",
                onClick: async () => {
                    const name = nameEditor.value?.trim() ?? "";
                    if (name === "") {
                        throw new Error("Le nom du rôle ne peut pas être vide.");
                    }
                    const permissions = Array.from(permissionEditors.entries())
                        .filter(([, editor]) => editor.value === true)
                        .map(([key]) => key);
                    await actionCall<DagdaActions, "createRole">("createRole", { name, permissions });
                    await this.refresh();
                }
            }
        ];
        openDialog({ title: "Nouveau rôle", body, actions });
    }

    protected _confirmDelete(role: Role): void {
        const body = document.createElement("p");
        body.textContent = `Supprimer le rôle « ${role.name} » ? Les comptes qui le portent perdront ses permissions.`;

        const actions: DialogAction[] = [
            { label: "Annuler" },
            {
                label: "Supprimer",
                className: "btn-primary",
                onClick: async () => {
                    await actionCall<DagdaActions, "deleteRole">("deleteRole", { id: role.id });
                    await this.refresh();
                }
            }
        ];
        openDialog({ title: "Supprimer le rôle", body, actions });
    }

}
customElements.define("roles-page", RolesPage);
