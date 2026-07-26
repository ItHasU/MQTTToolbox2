import { SettingsModel, SettingVisibility } from "@dagda/shared/src/settings/model";
import { JSTypes } from "@dagda/shared/src/entities/tools/javascript.types";

/**
 * System settings of the application (FEATURES §11, Dagda FEATURES §11.5).
 *
 * This is the half of the v1 `config.json` that only the server reads. The other
 * half — dashboards, cron scenarios, automations — are entities, because the
 * interface manipulates them.
 *
 * The broker password is the reason the mechanism exists: stored as an entity it
 * would travel through the client cache and be readable from the console.
 *
 * None of these are bootstrap (Dagda FEATURES §11.5): the server is already
 * listening and connected to its own database by the time any of them is
 * read, so none declares `env` — the editing screen (gated by `settings.manage`)
 * is the only way to set them, starting from the `default` below.
 */
export const APP_SETTINGS = new SettingsModel({

    "mqtt.url": {
        type: JSTypes.string,
        label: "URL du broker",
        description: "mqtt://hôte:1883, ou mqtts:// pour une connexion chiffrée.",
        default: "mqtt://localhost:1883"
    },

    "mqtt.clientId": {
        type: JSTypes.string,
        label: "Identifiant client",
        description: "Identifie cette instance auprès du broker. Deux clients partageant un identifiant se déconnectent mutuellement.",
        default: "mqtt-toolbox"
    },

    "mqtt.topics": {
        type: JSTypes.string,
        label: "Topics souscrits",
        description: "Séparés par des virgules. « # » souscrit à tout.",
        default: "#"
    },

    "mqtt.username": {
        type: JSTypes.string,
        label: "Utilisateur",
        description: "Vide si le broker n'exige pas d'authentification.",
        default: ""
    },

    "mqtt.password": {
        type: JSTypes.string,
        label: "Mot de passe",
        // Secret, so: encrypted at rest, never read back by the interface, and
        // refused at client visibility.
        secret: true,
        default: ""
    },

    "mqtt.enabled": {
        type: JSTypes.boolean,
        label: "Connexion active",
        description: "Décocher coupe la connexion sans perdre la configuration.",
        default: true
    },

    /**
     * Visible to the client: the status page displays it, and it is not a
     * secret by any reading — anyone holding an account may know how many
     * messages a topic keeps.
     */
    "history.messagesPerTopic": {
        type: JSTypes.number,
        label: "Messages conservés par topic",
        description: "Les plus anciens sont supprimés au-delà. 0 conserve tout.",
        default: 1000,
        visibility: SettingVisibility.client
    }

});

/** Keys of the settings, for whoever needs to name one */
export type AppSettings = typeof APP_SETTINGS extends SettingsModel<infer D> ? D : never;
