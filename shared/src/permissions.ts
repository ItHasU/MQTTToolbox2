import { DagdaPermission, PermissionsDeclaration } from "@dagda/shared/src/auth/permissions";

/**
 * Permissions declared by this application, on top of Dagda's own
 * (`DAGDA_PERMISSIONS`) — merged server-side by `AbstractServerApp`.
 *
 * Sharing a dashboard means running its owner's HTML — and whatever `<script>`
 * it contains — in the browser of whoever it's shared with (Dagda ROADMAP
 * tranche 4, FEATURES §6/§12). Viewing a dashboard shared with you needs no
 * permission, the same way `listUserNames()` doesn't: any authenticated
 * account may see what was shared with it. Authoring one — creating,
 * editing, sharing — is gated, since that's the actual trust boundary this
 * feature introduces.
 */
export const APP_PERMISSIONS = {
    "dashboards.edit": {
        label: "Créer et modifier des tableaux de bord",
        description: "Créer, éditer, réorganiser ou partager un tableau de bord — pas seulement consulter ceux qui sont partagés avec soi"
    },
    "publish.send": {
        label: "Publier des messages",
        description: "Envoyer un message immédiatement ou le planifier, et gérer la file d'attente des envois différés"
    }
} as const satisfies PermissionsDeclaration;

/** Every permission this application may check — the framework's own plus its own (FEATURES §0) */
export type AppPermission = DagdaPermission | keyof typeof APP_PERMISSIONS;
