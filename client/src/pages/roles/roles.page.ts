import { actionCall } from "@dagda/client/src/actions";
import { Ref } from "@dagda/client/src/components/abstract.webcomponent";
import { showToast } from "@dagda/client/src/components/toast/toast.component";
import { defaultFieldEditors, FieldEditor } from "@dagda/client/src/forms/editors";
import { AbstractPageElement } from "@dagda/client/src/pages/abstract.page.element";
import { DagdaActions } from "@dagda/shared/src/auth/actions";
import { DAGDA_PERMISSIONS } from "@dagda/shared/src/auth/permissions";
import { Role, RoleId } from "@dagda/shared/src/auth/types";
import { EntitiesModel } from "@dagda/shared/src/entities/model";
import { JSTypes } from "@dagda/shared/src/entities/tools/javascript.types";
import template from "./roles.page.html";

const PERMISSION_KEYS = Object.keys(DAGDA_PERMISSIONS) as (keyof typeof DAGDA_PERMISSIONS)[];
const BOOLEAN_TYPE = EntitiesModel.type({ rawType: JSTypes.boolean });
const STRING_TYPE = EntitiesModel.type({ rawType: JSTypes.string });

/**
 * One boolean editor per declared permission, keyed for reading back a
 * selection — built through the registry (Dagda FEATURES §8.1), not
 * `document.createElement("dagda-field-boolean")`: a browser refuses to
 * create a custom element that way once its constructor has added children,
 * which every Dagda editor's constructor does (it renders its own template).
 */
function buildPermissionCheckboxes(current: string[]): Map<string, FieldEditor<boolean>> {
    const editors = new Map<string, FieldEditor<boolean>>();
    for (const key of PERMISSION_KEYS) {
        const editor = defaultFieldEditors.createEditor(BOOLEAN_TYPE) as FieldEditor<boolean>;
        editor.value = current.includes(key);
        editors.set(key, editor);
    }
    return editors;
}

function selectedPermissions(editors: Map<string, FieldEditor<boolean>>): string[] {
    return Array.from(editors.entries()).filter(([, editor]) => editor.value === true).map(([key]) => key);
}

/**
 * The role × permission matrix (Dagda FEATURES §7.1, ROADMAP tranche 3): one
 * row per role, one column per declared permission, editable in place.
 *
 * Built by hand from the form generator's default editors (§8.1), same as
 * the publish page — a genuinely two-dimensional layout is not what
 * `<dagda-form>`'s flat field list is for.
 */
export class RolesPage extends AbstractPageElement {

    @Ref()
    protected _head!: HTMLTableSectionElement;
    @Ref()
    protected _rows!: HTMLTableSectionElement;
    @Ref("create-form")
    protected _createForm!: HTMLFormElement;
    @Ref("new-name")
    protected _newName!: FieldEditor<string>;
    @Ref("new-permissions")
    protected _newPermissionsContainer!: HTMLElement;

    protected _roles: Role[] = [];
    protected _newPermissionEditors!: Map<string, FieldEditor<boolean>>;

    constructor() {
        super({ template });
    }

    protected override async _init(): Promise<void> {
        this._buildHead();

        this._newPermissionEditors = buildPermissionCheckboxes([]);
        this._renderPermissionEditors(this._newPermissionsContainer, this._newPermissionEditors);

        this._createForm.addEventListener("submit", (event) => {
            event.preventDefault();
            this._createRole().catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
        });
    }

    protected override async _refresh(): Promise<void> {
        try {
            this._roles = await actionCall<DagdaActions, "listRoles">("listRoles");
        } catch (err) {
            showToast(err instanceof Error ? err.message : String(err));
            return;
        }
        this._renderRows();
    }

    protected _buildHead(): void {
        const row = document.createElement("tr");
        const roleHeader = document.createElement("th");
        roleHeader.textContent = "Rôle";
        row.appendChild(roleHeader);
        for (const key of PERMISSION_KEYS) {
            const th = document.createElement("th");
            th.textContent = DAGDA_PERMISSIONS[key].label;
            th.title = DAGDA_PERMISSIONS[key].description ?? "";
            row.appendChild(th);
        }
        row.appendChild(document.createElement("th")); // actions
        this._head.replaceChildren(row);
    }

    protected _renderPermissionEditors(container: HTMLElement, editors: Map<string, FieldEditor<boolean>>): void {
        container.replaceChildren();
        for (const key of PERMISSION_KEYS) {
            const field = document.createElement("div");
            field.className = "field";
            const label = document.createElement("span");
            label.className = "text-muted";
            label.textContent = DAGDA_PERMISSIONS[key].label;
            field.append(label, editors.get(key)!);
            container.appendChild(field);
        }
    }

    protected _renderRows(): void {
        this._rows.replaceChildren();
        for (const role of this._roles) {
            const row = document.createElement("tr");

            const nameCell = document.createElement("td");
            const nameEditor = defaultFieldEditors.createEditor(STRING_TYPE) as FieldEditor<string>;
            nameEditor.value = role.name;
            nameCell.appendChild(nameEditor);
            row.appendChild(nameCell);

            const permissionEditors = buildPermissionCheckboxes(role.permissions);
            for (const key of PERMISSION_KEYS) {
                const cell = document.createElement("td");
                cell.appendChild(permissionEditors.get(key)!);
                row.appendChild(cell);
            }

            const actionsCell = document.createElement("td");
            const save = document.createElement("button");
            save.type = "button";
            save.className = "btn btn-primary";
            save.textContent = "Enregistrer";
            save.addEventListener("click", () => {
                this._updateRole(role.id, nameEditor.value ?? role.name, selectedPermissions(permissionEditors))
                    .catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
            });
            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "btn btn-ghost";
            remove.textContent = "Supprimer";
            remove.addEventListener("click", () => {
                this._deleteRole(role.id).catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
            });
            actionsCell.append(save, remove);
            row.appendChild(actionsCell);

            this._rows.appendChild(row);
        }
    }

    protected async _createRole(): Promise<void> {
        const name = this._newName.value?.trim() ?? "";
        if (name === "") {
            showToast("Le nom du rôle ne peut pas être vide.");
            return;
        }
        await actionCall<DagdaActions, "createRole">("createRole", { name, permissions: selectedPermissions(this._newPermissionEditors) });
        this._newName.value = "";
        this._newPermissionEditors = buildPermissionCheckboxes([]);
        this._renderPermissionEditors(this._newPermissionsContainer, this._newPermissionEditors);
        await this.refresh();
    }

    protected async _updateRole(id: RoleId, name: string, permissions: string[]): Promise<void> {
        await actionCall<DagdaActions, "updateRole">("updateRole", { id, name, permissions });
        await this.refresh();
    }

    protected async _deleteRole(id: RoleId): Promise<void> {
        await actionCall<DagdaActions, "deleteRole">("deleteRole", { id });
        await this.refresh();
    }

}
customElements.define("roles-page", RolesPage);
