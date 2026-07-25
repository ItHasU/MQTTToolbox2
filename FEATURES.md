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
  - `automatisme` — publié par un scénario du planificateur ou par une fonction (§5),
    en identifiant *lequel*,
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

> **Décidé** : on garde **les deux**. Le planificateur reste la voie simple, sans
> écrire une ligne de code, pour « publier ce message à cette heure-là » ; les
> automatismes (§5) couvrent tout le reste.
>
> Conséquence : deux mécanismes d'ordonnancement coexistent. Ils doivent partager
> la même implémentation de calcul des occurrences et la même horloge, sinon la
> même expression cron produira deux comportements différents selon l'endroit
> où elle est saisie.

## 5. Automatismes (fonctions utilisateur)

> Nouveauté majeure de la v2. L'utilisateur écrit des fonctions **depuis le
> client**, mais elles sont **exécutées sur le serveur**, y compris — et surtout —
> quand aucun client n'est connecté. C'est ce qui fait passer l'outil d'un
> tableau de bord à un véritable moteur de domotique.

### 5.1 Principe

- 🆕 Une **automatisme** = un nom, un interrupteur activé/désactivé, un ou plusieurs
  déclencheurs, et un corps de fonction.
- 🆕 Édition depuis le client, dans le même éditeur que les tableaux de bord (Monaco, §6).
- 🆕 Exécution côté serveur, indépendante de toute session client.
- 🆕 Persistance en base : le code fait partie des données de l'application.
- 🆕 Activation / désactivation sans suppression.

### 5.2 Déclencheurs

- 🆕 **Cron / temporel** : à une date, à intervalle régulier, selon un planning hebdomadaire.
- 🆕 **Réception d'un message** sur un topic ou un motif de topic (avec `+` et `#`),
  affinée par une **formule TypeScript de filtrage** évaluée à chaque message reçu.
  - Remplace le choix figé « tout message » / « changement de valeur » : l'utilisateur
    écrit sa condition (comparaison à la valeur précédente, seuil, plage horaire…).
  - La formule doit donc recevoir la **valeur précédente** du topic, en plus du message
    courant — sans quoi le cas « changement de valeur » n'est pas exprimable.
  - Elle est évaluée sur le **chemin critique de la réception MQTT** : elle doit être
    rapide, sans effet de bord et sans accès réseau. C'est un filtre, pas une action.
    Prévoir un délai maximal, et que faire d'une formule qui échoue (ignorer le message
    ou déclencher quand même ?).
  - Même mécanisme réutilisable pour `mqtt-if` / `mqtt-json` côté tableau de bord (§6.1) :
    cela réglerait leur `new Function()` et donnerait un seul langage d'expression
    dans tout l'outil.
- 🆕 **Connexion / déconnexion d'un utilisateur.**
- 🆕 **Démarrage du serveur** (initialisation d'un état).
- 🆕 **Déclenchement manuel** depuis l'UI (bouton, utile pour tester).
- 🆕 **Appel via l'API HTTP** (§10) — permet à un système externe de déclencher un automatisme.
- 🆕 **Chaînage autorisé, mais borné** : un automatisme peut en déclencher un autre,
  directement ou en publiant un message qui sert de déclencheur. Au-delà de N niveaux
  la chaîne est interrompue (cf. §5.6), et l'historique conserve le lien de causalité
  entre les exécutions (§5.5).

### 5.3 API disponible dans une fonction

- 🆕 Publier un message (les messages émis sont marqués `automatisme` + identifiant, §2).
- 🆕 Lire la dernière valeur d'un topic, et l'historique d'un topic (§2).
- 🆕 Accéder au contexte du déclenchement : quel déclencheur, quel message,
  quel utilisateur, quelle date.
- 🆕 Journaliser (`log`) — la sortie est rattachée à l'exécution (§5.5).
- 🆕 **État persistant** entre deux exécutions (un petit stockage clé/valeur par automatisme) —
  indispensable pour la plupart des comportements utiles (compteurs, anti-rebond, machines à états).
- 🆕 Programmer un message différé (§3) ou annuler un message programmé.
- 🆕 **Appels HTTP sortants autorisés** — pour déclencher d'autres services depuis
  un automatisme.
  - Chaque appel doit avoir son propre délai d'attente : un service tiers lent ne
    doit pas consommer tout le budget d'exécution de l'automatisme (§5.4).
- 🆕 **Magasin de secrets** : les jetons des services appelés sont stockés en base et
  référencés par nom depuis le code (`secrets.get("pushover")`), jamais écrits en clair
  dans l'automatisme.
  - Gérés depuis l'UI par un administrateur ; une fois saisis, ils ne sont plus
    relisibles en clair depuis l'interface.
  - **Exclus de l'export de configuration** (§8) et du versionnement du code (§5.6).
  - À prévoir : chiffrement au repos (donc une clé de chiffrement fournie au serveur
    par variable d'environnement), et la trace de quel automatisme lit quel secret.

### 5.4 Exécution & sécurité

> C'est le point dur de la fonctionnalité : on exécute du code arbitraire sur le
> serveur. À concevoir avant d'écrire une ligne de code.

- 🆕 Choix du bac à sable : `node:vm` (insuffisant seul), `isolated-vm`,
  `worker_threads`, ou processus séparé. À arbitrer entre isolation et complexité.
- 🆕 **Délai d'exécution maximal** avec interruption effective (une boucle infinie ne
  doit pas figer le serveur).
- 🆕 Limite mémoire.
- 🆕 Surface d'API strictement limitée à §5.3 : pas d'accès au système de fichiers,
  pas de `require`, pas d'accès direct à la base. Le réseau sortant est la seule
  ouverture vers l'extérieur, et elle est volontaire (§5.3).
- 🆕 **Qui a le droit d'écrire un automatisme ?** Écrire un automatisme revient à
  exécuter du code sur le serveur : ce doit être un droit d'administrateur,
  pas un droit d'utilisateur (cf. §12).
- 🆕 Une erreur dans une fonction ne doit jamais interrompre le service : capture,
  journalisation, puis **désactivation automatique après N échecs consécutifs**,
  avec notification de l'utilisateur (§5.5).
  - Le compteur d'échecs se remet à zéro à la première exécution réussie.
  - La désactivation automatique doit être visible et distinguable d'une désactivation
    manuelle dans l'UI, sinon un comportement attendu s'arrête sans que personne
    ne comprenne pourquoi.
  - Réactivation manuelle explicite après correction.
- 🆕 Sérialisation des exécutions d'un même automatisme (pas de réentrance),
  et limite de parallélisme global.
- 🆕 **Langage : TypeScript**, transpilé à l'enregistrement. Les typages fournis à
  Monaco décrivent la surface d'API autorisée (§5.3), donnent l'autocomplétion, et
  un refus de compilation en cas d'erreur de type sert de premier filtre.
- ⚠️ **Le typage n'est pas une barrière de sécurité.** Les types sont effacés à la
  compilation et se contournent trivialement (`as any`, accès par chaîne,
  `globalThis`…). Restreindre les fonctions par les types améliore le confort
  d'écriture et attrape les erreurs honnêtes ; **la sécurité reste entièrement
  portée par le bac à sable d'exécution**. Ne pas se reposer sur l'un pour l'autre.

### 5.5 Historique des déclenchements

> Exigence explicite : on garde une trace de **tous** les déclenchements.

- 🆕 Une entrée par exécution : automatisme, déclencheur, date de début, durée,
  résultat (succès / erreur / interrompu par le délai maximal).
- 🆕 Contexte du déclenchement (le message reçu, l'utilisateur concerné…).
- 🆕 Sortie de journalisation et trace d'erreur associées.
- 🆕 Messages publiés au cours de l'exécution (lien vers l'historique des messages, §2).
- 🆕 **Lien de causalité** : quelle exécution a déclenché quelle autre, pour pouvoir
  remonter une chaîne d'automatismes (§5.2) et diagnostiquer une boucle.
- 🆕 Consultation et filtrage depuis l'UI (par automatisme, par résultat, par période).
- 🆕 Politique de rétention, comme pour les messages (§2).
- 🆕 **Notification en cas d'échec**, et notification distincte lors d'une désactivation
  automatique après N échecs (§5.4). Reste à définir le canal : notification navigateur
  (Dagda), message MQTT sur un topic de service, ou les deux.

> Nuance par rapport à la décision prise en §4 : là où le journal du cron était
> redondant avec l'historique des messages, ce n'est pas le cas ici — un
> automatisme peut s'exécuter sans rien publier, et on veut quand même savoir
> qu'il s'est déclenché et ce qu'il a fait.

### 5.6 Garde-fous fonctionnels

- 🆕 **Boucles** : un automatisme déclenché sur réception de message et qui publie un
  message peut se rappeler lui-même indéfiniment. Le chaînage étant autorisé (§5.2),
  la protection repose sur une **profondeur maximale de chaîne**, complétée par une
  limite de déclenchements par unité de temps pour les cycles que la profondeur
  ne suffit pas à couvrir (deux automatismes qui se répondent lentement).
  Un dépassement doit apparaître dans l'historique (§5.5), pas seulement être bloqué.
- 🆕 Redémarrage : les déclencheurs temporels manqués pendant l'arrêt du serveur sont
  **ignorés**, sans rattrapage. Le déclencheur « démarrage du serveur » (§5.2) reste
  le moyen de recalculer un état si nécessaire.
- 🆕 Mode test / simulation : exécuter sans publier réellement.
- 🆕 Versionnement du code d'un automatisme (retour à une version précédente).

## 6. Tableau de bord personnalisable

C'est **la** fonctionnalité centrale de l'outil.

- ✅ Le tableau de bord est du **HTML libre**, saisi par l'utilisateur.
- ✅ Éditeur de code intégré (coloration HTML, thème sombre).
- ✅ Raccourci clavier (`Ctrl+E`) pour ouvrir/fermer l'éditeur en superposition.
- ✅ Sauvegarde et rechargement immédiat du tableau de bord.
- 🔄 Un seul tableau de bord en v1 → en supporter **plusieurs**.
- 🆕 Sur mobile, navigation par *swipe* entre les tableaux de bord.
- 🔄 Tableaux de bord **par utilisateur**, avec possibilité de les **partager**
  (implique une notion de propriétaire et de droits — cf. §12).
- 🆕 Passer à **Monaco Editor** (remplace CodeMirror) — mutualisé avec l'éditeur
  d'automatismes (§5).
- 🆕 Prévisualisation en direct pendant l'édition.
- 🆕 Bibliothèque d'exemples / snippets insérables.

### 6.1 Composants web disponibles dans le tableau de bord

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
- 🔄 `mqtt-json` et `mqtt-if` évaluent le chemin avec `new Function()` — à remplacer
  par le même langage d'expression que les filtres de déclencheurs (§5.2).
- ❌ Composant d'action (bouton / interrupteur publiant un message) : on garde l'API
  JavaScript à la place (§6.2).

### 6.2 API JavaScript exposée au tableau de bord

- ✅ Objet global (`window.MQTT` en v1) accessible depuis le HTML du tableau de bord.
- ✅ `get(topic)`, `getAll()`, `list()` — lecture synchrone du cache.
- ✅ `on(topic, callback)` — abonnement aux changements.
- ✅ `publish(topic, payload, options)` — payload chaîne, objet (sérialisé en JSON) ou binaire.
- ✅ `getScheduled()`, `cancelScheduled(id)`.
- 🔄 Formaliser et documenter cette API : c'est le point d'extension principal
  pour l'utilisateur, elle doit être stable et typée.
- 🆕 Garder cette API **cohérente avec celle des automatismes** (§5.3) : mêmes noms,
  mêmes signatures, pour que l'utilisateur n'ait qu'un seul modèle mental —
  la différence étant le lieu d'exécution (navigateur vs serveur).
- 🆕 Déclencher un automatisme depuis le tableau de bord.

## 7. Page Statut

- ✅ Tableau de tous les messages reçus : horodatage, topic, payload décodé.
- ✅ Tableau des messages programmés, avec suppression unitaire.
- 🔄 Rafraîchissement manuel + auto toutes les 10 s → **rafraîchissement en temps réel**
  (notifications WebSocket, cf. §9).
- 🆕 Recherche / filtre par topic.
- 🆕 Tri par colonne.
- 🆕 Vue arborescente des topics.
- 🆕 Affichage de la source du message (§2).
- 🆕 Vue d'ensemble des automatismes : état, dernier déclenchement, dernier résultat (§5.5).

## 8. Page Réglages

- ✅ Configuration MQTT : URL, clientId, mot de passe, liste des topics.
- 🔄 Édition du tableau de bord depuis les réglages — à revoir avec le multi-dashboard.
- 🆕 Import / export de la configuration complète (y compris automatismes et tableaux
  de bord), **secrets exclus** (§5.3) — l'import doit donc signaler les secrets manquants.
- 🆕 Écran de gestion des secrets, réservé aux administrateurs (§5.3).
- 🆕 Test de connexion avant sauvegarde.

## 9. Synchronisation client ↔ serveur

- 🔄 En v1 : polling HTTP toutes les 2 secondes (`/mqtt/all` avec en-tête `After`)
  → en v2, utiliser les **notifications WebSocket de Dagda** pour du vrai temps réel.
- ✅ Récupération incrémentale (seuls les messages plus récents que le dernier appel).
- 🔄 Encodage des payloads binaires via le format `{type:"Buffer", data:[…]}` de Node —
  à remplacer par quelque chose de plus propre.

## 10. API HTTP

- ✅ `GET /mqtt/list` — liste des topics connus.
- ✅ `GET /mqtt/all` — tous les derniers messages (filtrable par date).
- ✅ `POST /mqtt/get` — dernier message d'un topic.
- ✅ `POST /mqtt/publish` — publication (topic et options en en-têtes HTTP, payload en corps).
- ✅ `GET /mqtt/scheduled` — messages programmés.
- ✅ `GET /mqtt/cancelScheduled` — annulation.
- ✅ `GET /config` / `POST /config` — lecture / écriture de la configuration.
- 🆕 Déclenchement d'un automatisme depuis l'extérieur (§5.2).
- ❌ `GET /exit` — n'a plus lieu d'être une fois la persistance en base (§3).
- 🔄 À remplacer par les **APIs typées de Dagda** (déclaration par type TypeScript partagé).
- 🆕 Conserver une API HTTP simple (`curl`-friendly) pour les intégrations externes,
  avec un mode d'authentification adapté (jeton ?) puisque l'app est authentifiée (§12).

## 11. Configuration & persistance

- 🔄 v1 : un unique fichier `config.json` (chemin par variable `CONFIG`), chargé en cache,
  avec système de callbacks sur changement de valeur
  → en v2, passer au **modèle d'entités Dagda** (base de données).
- ⚠️ Conséquence : Dagda ne supporte que **PostgreSQL** (ni SQLite ni fichier).
  Le déploiement passe donc d'un conteneur autonome à un couple app + base,
  ce qui alourdit sensiblement une installation sur petite machine.
- ✅ Port d'écoute par variable d'environnement `PORT`.
- 🆕 Sauvegarde / restauration de la configuration.

## 12. Utilisateurs & authentification

- 🆕 Authentification (aucune en v1 — l'outil était supposé sur un réseau de confiance).
  Dagda fournit Google OAuth2 et, à terme, des comptes locaux. **Pas de mode
  « sans authentification »**.
- 🆕 Notion d'utilisateur propriétaire pour les tableaux de bord + partage (§6).
- 🆕 Traçabilité : les publications manuelles sont attribuées à leur auteur (§2).
- 🆕 **Rôle administrateur** requis pour écrire des automatismes (§5.4) — la distinction
  administrateur / utilisateur devient nécessaire, elle n'était qu'optionnelle avant.
- 🆕 La connexion / déconnexion d'un utilisateur est un événement exploitable
  par les automatismes (§5.2) — le serveur doit donc l'exposer.

## 13. Interface & déploiement

- ✅ Application web mono-page, navigation par pages (Dashboard / Statut / Cron / Réglages
  / **Automatismes**).
- ✅ PWA installable (manifest, icônes, mode `minimal-ui`).
- ✅ Image Docker multi-architecture (amd64, arm64).
- ✅ Fuseau horaire géré dans l'image Docker (important pour le cron et les automatismes).
- 🔄 Passer de NX / jQuery / Bootstrap 4 à Dagda / web components.
- 🆕 **Choix d'un design system** — sans Bootstrap. À trancher au niveau de Dagda,
  pas de MQTTToolbox (couvre aussi le thème clair / sombre).
- ❌ Service systemd (`mqtt-toolbox.service`) — Docker uniquement.
