# MQTTToolbox 2 — Liste des fonctionnalités

> Premier jet, établi à partir de la version 1 (monorepo NX, jQuery + Bootstrap 4).
> Objectif de la v2 : même périmètre fonctionnel, réécrit sur **Dagda**.
>
> Légende :
> - ✅ existe en v1, à reprendre
> - 🔄 existe en v1, à revoir / repenser
> - 🆕 nouveau, à évaluer

---

## 1. Connexion MQTT (serveur)

- ✅ Connexion à un broker MQTT (URL, clientId, mot de passe).
- ✅ Abonnement à une liste de topics configurable (`#` par défaut).
- ✅ Reconnexion / reconfiguration à chaud lorsque la configuration change.
- ✅ Conservation en mémoire du **dernier message reçu par topic**, avec son horodatage.
- 🔄 Indicateur d'état de connexion au broker (aujourd'hui peu visible dans l'UI).
- 🆕 Historique des valeurs (séries temporelles), pas seulement la dernière valeur.
- 🆕 Support de plusieurs brokers simultanés.
- 🆕 Support TLS / certificats client explicite dans l'UI.

## 2. Publication de messages

- ✅ Publication immédiate sur un topic (payload binaire ou texte).
- ✅ Publication **différée** : soit après un délai (`timeout`), soit à une date donnée (`timestamp`).
- ✅ Liste des messages programmés en attente.
- ✅ Annulation d'un message programmé.
- ✅ Persistance des messages programmés au redémarrage / à l'arrêt du serveur
  (sauvegarde dans la configuration, re-programmation au démarrage).
- 🔄 Le rechargement des messages différés passe par le fichier de config — à revoir
  avec la persistance en base de Dagda.
- 🆕 Flags MQTT à l'émission : `retain`, `QoS`.

## 3. Planificateur (cron)

- ✅ Notion de **scénario** : un nom, un interrupteur activé/désactivé, une liste de tâches.
- ✅ Une tâche = jours de la semaine (7 cases) + heure + minute + topic + payload.
- ✅ Calcul de la prochaine occurrence, ré-armement automatique après chaque déclenchement.
- ✅ Édition des scénarios et des tâches depuis l'interface (boîte de dialogue).
- ✅ Prise en compte immédiate des modifications de configuration.
- 🆕 Expression cron complète (ou au moins : dates, intervalles, « toutes les N minutes »).
- 🆕 Décalage aléatoire / offset (ex. lever du soleil ± X minutes).
- 🆕 Historique des déclenchements (quand une tâche s'est-elle réellement exécutée ?).
- 🆕 Déclenchement manuel d'une tâche (bouton « exécuter maintenant »).

## 4. Tableau de bord personnalisable

C'est **la** fonctionnalité centrale de l'outil.

- ✅ Le tableau de bord est du **HTML libre**, saisi par l'utilisateur et stocké en configuration.
- ✅ Éditeur de code intégré (CodeMirror, coloration HTML, thème sombre).
- ✅ Raccourci clavier (`Ctrl+E`) pour ouvrir/fermer l'éditeur en superposition.
- ✅ Sauvegarde et rechargement immédiat du tableau de bord.
- 🔄 Un seul tableau de bord — 🆕 en supporter plusieurs (onglets / pages).
- 🆕 Prévisualisation en direct pendant l'édition.
- 🆕 Bibliothèque d'exemples / snippets insérables.

### Composants web disponibles dans le tableau de bord

| Composant | Rôle |
|---|---|
| `<mqtt-value topic="…">` | Affiche le payload brut du dernier message d'un topic |
| `<mqtt-json topic="…" path="…">` | Affiche une valeur extraite d'un payload JSON |
| `<mqtt-date topic="…" format="…">` | Affiche la date du dernier message |
| `<mqtt-age topic="…" unit="…">` | Affiche l'ancienneté du dernier message, unité auto ou forcée |
| `<mqtt-if topic="…" path="…" equals/not-equals="…">` | Affiche ou masque son contenu selon la valeur |

- 🆕 Composant d'action : bouton / interrupteur qui **publie** un message.
- 🆕 Composant de graphique (nécessite l'historique).
- 🆕 Composant de jauge / indicateur visuel.
- 🆕 Formatage des valeurs (unités, décimales, table de correspondance).
- 🔄 `mqtt-json` et `mqtt-if` utilisent `new Function()` pour évaluer le chemin — à sécuriser.

## 5. Page Statut

- ✅ Tableau de tous les messages reçus : horodatage, topic, payload décodé.
- ✅ Tableau des messages programmés, avec suppression unitaire.
- ✅ Rafraîchissement manuel + rafraîchissement automatique toutes les 10 s.
- 🆕 Recherche / filtre par topic.
- 🆕 Tri par colonne.
- 🆕 Vue arborescente des topics.

## 6. Page Réglages

- ✅ Configuration MQTT : URL, clientId, mot de passe, liste des topics.
- ✅ Édition du tableau de bord depuis les réglages.
- 🆕 Import / export de la configuration complète.
- 🆕 Test de connexion avant sauvegarde.

## 7. Synchronisation client ↔ serveur

- 🔄 En v1 : polling HTTP toutes les 2 secondes (`/mqtt/all` avec en-tête `After`)
  → en v2, utiliser les **notifications WebSocket de Dagda** pour du vrai temps réel.
- ✅ Récupération incrémentale (seuls les messages plus récents que le dernier appel).
- 🔄 Encodage des payloads binaires via le format `{type:"Buffer", data:[…]}` de Node —
  à remplacer par quelque chose de plus propre.

## 8. API HTTP

- ✅ `GET /mqtt/list` — liste des topics connus.
- ✅ `GET /mqtt/all` — tous les derniers messages (filtrable par date).
- ✅ `POST /mqtt/get` — dernier message d'un topic.
- ✅ `POST /mqtt/publish` — publication (topic et options en en-têtes HTTP, payload en corps).
- ✅ `GET /mqtt/scheduled` — messages programmés.
- ✅ `GET /mqtt/cancelScheduled` — annulation.
- ✅ `GET /config` / `POST /config` — lecture / écriture de la configuration.
- ✅ `GET /exit` — arrêt propre avec persistance.
- 🔄 À remplacer par les **APIs typées de Dagda** (déclaration par type TypeScript partagé).
- 🆕 Conserver une API HTTP simple (`curl`-friendly) pour les intégrations externes.

## 9. Configuration & persistance

- 🔄 v1 : un unique fichier `config.json` (chemin par variable `CONFIG`), chargé en cache,
  avec système de callbacks sur changement de valeur
  → en v2, passer au **modèle d'entités Dagda** (base de données).
- ✅ Port d'écoute par variable d'environnement `PORT`.
- 🆕 Sauvegarde / restauration de la configuration.

## 10. Interface & déploiement

- ✅ Application web mono-page, navigation par pages (Dashboard / Statut / Cron / Réglages).
- ✅ PWA installable (manifest, icônes, mode `minimal-ui`).
- ✅ Image Docker multi-architecture (amd64, arm/v7 — Raspberry Pi).
- ✅ Service systemd fourni (`mqtt-toolbox.service`).
- ✅ Fuseau horaire géré dans l'image Docker (important pour le cron).
- 🔄 Passer de NX / jQuery / Bootstrap 4 à Dagda / web components / Bootstrap 5.
- 🆕 Authentification (aucune en v1 — l'outil est supposé sur un réseau de confiance).
  Dagda fournit Google OAuth2 ; prévoir aussi un mode sans authentification assumé.
- 🆕 Thème sombre.
