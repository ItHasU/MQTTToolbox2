# MQTTToolbox 2 — Liste des fonctionnalités

> Premier jet, établi à partir de la version 1 (monorepo NX, jQuery + Bootstrap 4).
> Objectif de la v2 : même périmètre fonctionnel, réécrit sur **Dagda**.
>
> Légende :
> - ✅ existe en v1, à reprendre
> - 🔄 existe en v1, à revoir / repenser
> - 🆕 nouveau, à évaluer
> - ❌ écarté (conservé ici pour garder la trace de la décision)

---

## 1. Connexion MQTT (serveur)

- ✅ Connexion à un broker MQTT (URL, clientId, mot de passe).
- ✅ Abonnement à une liste de topics configurable (`#` par défaut).
- ✅ Reconnexion / reconfiguration à chaud lorsque la configuration change.
- ✅ Conservation en mémoire du **dernier message reçu par topic**, avec son horodatage.
- 🔄 Indicateur d'état de connexion au broker (aujourd'hui peu visible dans l'UI).
- 🆕 Support de plusieurs brokers simultanés.
- 🆕 Support TLS / certificats client explicite dans l'UI.

## 2. Historique des messages

> Structurant : c'est l'historique qui remplace le journal du planificateur et qui
> alimente les composants de graphique.

- 🆕 Persistance de **tous** les messages (et pas seulement de la dernière valeur par topic).
- 🆕 Chaque message stocke sa **source** :
  - `externe` — reçu du broker,
  - `automatisme` — publié par un scénario du planificateur,
  - `manuel` — publié par un utilisateur depuis le tableau de bord (tracer *quel* utilisateur).
- 🆕 Politique de rétention / purge (par âge, par topic, par volume) — sinon la base grossit sans fin.
- 🆕 Consultation de l'historique d'un topic (et export ?).

## 3. Publication de messages

- ✅ Publication immédiate sur un topic (payload binaire ou texte).
- ✅ Publication **différée** : soit après un délai (`timeout`), soit à une date donnée (`timestamp`).
- ✅ Liste des messages programmés en attente.
- ✅ Annulation d'un message programmé.
- ✅ Persistance des messages programmés au redémarrage / à l'arrêt du serveur.
- 🔄 En v1 la persistance passe par le fichier de configuration (sauvegarde sur `SIGINT`,
  re-programmation au démarrage) — à remplacer par la persistance en base de Dagda,
  ce qui supprime aussi le besoin du hook d'arrêt.
- 🆕 Flags MQTT à l'émission : `retain`, `QoS`.

## 4. Planificateur (cron)

- ✅ Notion de **scénario** : un nom, un interrupteur activé/désactivé, une liste de tâches.
- ✅ Une tâche = jours de la semaine (7 cases) + heure + minute + topic + payload.
- ✅ Calcul de la prochaine occurrence, ré-armement automatique après chaque déclenchement.
- ✅ Édition des scénarios et des tâches depuis l'interface (boîte de dialogue).
- ✅ Prise en compte immédiate des modifications de configuration.
- 🆕 Expression cron complète (ou au moins : dates, intervalles, « toutes les N minutes »).
- 🆕 Déclenchement manuel d'une tâche (bouton « exécuter maintenant »),
  le message émis étant alors marqué comme source `manuel`.
- ❌ Décalage aléatoire / offset (ex. lever du soleil ± X minutes).
- ❌ Journal des déclenchements dédié — couvert par l'historique des messages (§2)
  via le champ *source*.

## 5. Tableau de bord personnalisable

C'est **la** fonctionnalité centrale de l'outil.

- ✅ Le tableau de bord est du **HTML libre**, saisi par l'utilisateur.
- ✅ Éditeur de code intégré (coloration HTML, thème sombre).
- ✅ Raccourci clavier (`Ctrl+E`) pour ouvrir/fermer l'éditeur en superposition.
- ✅ Sauvegarde et rechargement immédiat du tableau de bord.
- 🔄 Un seul tableau de bord en v1 → en supporter **plusieurs**.
- 🆕 Sur mobile, navigation par *swipe* entre les tableaux de bord.
- 🔄 Tableaux de bord **par utilisateur**, avec possibilité de les **partager**
  (implique une notion de propriétaire et de droits — cf. §11).
- 🆕 Passer à **Monaco Editor** (remplace CodeMirror).
- 🆕 Prévisualisation en direct pendant l'édition.
- 🆕 Bibliothèque d'exemples / snippets insérables.

### 5.1 Composants web disponibles dans le tableau de bord

| Composant | Rôle |
|---|---|
| `<mqtt-value topic="…">` | Affiche le payload brut du dernier message d'un topic |
| `<mqtt-json topic="…" path="…">` | Affiche une valeur extraite d'un payload JSON |
| `<mqtt-date topic="…" format="…">` | Affiche la date du dernier message |
| `<mqtt-age topic="…" unit="…">` | Affiche l'ancienneté du dernier message, unité auto ou forcée |
| `<mqtt-if topic="…" path="…" equals/not-equals="…">` | Affiche ou masque son contenu selon la valeur |

- 🆕 Composant de graphique (s'appuie sur l'historique, §2).
- 🆕 Composant de jauge / indicateur visuel.
- 🆕 Formatage des valeurs (unités, décimales, table de correspondance).
- 🔄 `mqtt-json` et `mqtt-if` évaluent le chemin avec `new Function()` — à sécuriser.
- ❌ Composant d'action (bouton / interrupteur publiant un message) : on garde l'API
  JavaScript à la place (§5.2).

### 5.2 API JavaScript exposée au tableau de bord

- ✅ Objet global (`window.MQTT` en v1) accessible depuis le HTML du tableau de bord.
- ✅ `get(topic)`, `getAll()`, `list()` — lecture synchrone du cache.
- ✅ `on(topic, callback)` — abonnement aux changements.
- ✅ `publish(topic, payload, options)` — payload chaîne, objet (sérialisé en JSON) ou binaire.
- ✅ `getScheduled()`, `cancelScheduled(id)`.
- 🔄 Formaliser et documenter cette API : c'est le point d'extension principal
  pour l'utilisateur, elle doit être stable et typée.

## 6. Page Statut

- ✅ Tableau de tous les messages reçus : horodatage, topic, payload décodé.
- ✅ Tableau des messages programmés, avec suppression unitaire.
- 🔄 Rafraîchissement manuel + auto toutes les 10 s → **rafraîchissement en temps réel**
  (notifications WebSocket, cf. §8).
- 🆕 Recherche / filtre par topic.
- 🆕 Tri par colonne.
- 🆕 Vue arborescente des topics.
- 🆕 Affichage de la source du message (§2).

## 7. Page Réglages

- ✅ Configuration MQTT : URL, clientId, mot de passe, liste des topics.
- 🔄 Édition du tableau de bord depuis les réglages — à revoir avec le multi-dashboard.
- 🆕 Import / export de la configuration complète.
- 🆕 Test de connexion avant sauvegarde.

## 8. Synchronisation client ↔ serveur

- 🔄 En v1 : polling HTTP toutes les 2 secondes (`/mqtt/all` avec en-tête `After`)
  → en v2, utiliser les **notifications WebSocket de Dagda** pour du vrai temps réel.
- ✅ Récupération incrémentale (seuls les messages plus récents que le dernier appel).
- 🔄 Encodage des payloads binaires via le format `{type:"Buffer", data:[…]}` de Node —
  à remplacer par quelque chose de plus propre.

## 9. API HTTP

- ✅ `GET /mqtt/list` — liste des topics connus.
- ✅ `GET /mqtt/all` — tous les derniers messages (filtrable par date).
- ✅ `POST /mqtt/get` — dernier message d'un topic.
- ✅ `POST /mqtt/publish` — publication (topic et options en en-têtes HTTP, payload en corps).
- ✅ `GET /mqtt/scheduled` — messages programmés.
- ✅ `GET /mqtt/cancelScheduled` — annulation.
- ✅ `GET /config` / `POST /config` — lecture / écriture de la configuration.
- ❌ `GET /exit` — n'a plus lieu d'être une fois la persistance en base (§3).
- 🔄 À remplacer par les **APIs typées de Dagda** (déclaration par type TypeScript partagé).
- 🆕 Conserver une API HTTP simple (`curl`-friendly) pour les intégrations externes,
  avec un mode d'authentification adapté (jeton ?) puisque l'app est authentifiée (§11).

## 10. Configuration & persistance

- 🔄 v1 : un unique fichier `config.json` (chemin par variable `CONFIG`), chargé en cache,
  avec système de callbacks sur changement de valeur
  → en v2, passer au **modèle d'entités Dagda** (base de données).
- ⚠️ Conséquence : Dagda ne supporte que **PostgreSQL** (ni SQLite ni fichier).
  Le déploiement passe donc d'un conteneur autonome à un couple app + base,
  ce qui alourdit sensiblement une installation sur petite machine.
- ✅ Port d'écoute par variable d'environnement `PORT`.
- 🆕 Sauvegarde / restauration de la configuration.

## 11. Utilisateurs & authentification

- 🆕 Authentification (aucune en v1 — l'outil était supposé sur un réseau de confiance).
  Dagda fournit Google OAuth2. **Pas de mode « sans authentification »**.
- 🆕 Notion d'utilisateur propriétaire pour les tableaux de bord + partage (§5).
- 🆕 Traçabilité : les publications manuelles sont attribuées à leur auteur (§2).

## 12. Interface & déploiement

- ✅ Application web mono-page, navigation par pages (Dashboard / Statut / Cron / Réglages).
- ✅ PWA installable (manifest, icônes, mode `minimal-ui`).
- ✅ Image Docker multi-architecture (amd64, arm64).
- ✅ Fuseau horaire géré dans l'image Docker (important pour le cron).
- 🔄 Passer de NX / jQuery / Bootstrap 4 à Dagda / web components.
- 🆕 **Choix d'un design system** — sans Bootstrap. À trancher au niveau de Dagda,
  pas de MQTTToolbox (couvre aussi le thème clair / sombre).
- ❌ Service systemd (`mqtt-toolbox.service`) — Docker uniquement.
