Faisons maintenant une petite phase de refactor, voici mes remarques :

## Dagda
* [x] Déplace toutes les pages qui ne sont pas spécifiques à l'application dans le framework (Préférences, gestion des utilisateurs, ...)
* [x] Met le style des pages à côté de leur html et ts

## API
* [x] Depuis la console, distinguer :
  * dagda.routes.xxx() => Appel d'une route
  * dagda.actions.xxx(tr, ...) => Appel d'une fonction modifiant les entités
  * et fournir une méthode encapsulate(async (tr) => {}) pour les actions
* [x] Faire en sorte que dagda.routes soit enumerable pour avoir la completion dans la console
* [x] Ajouter un message de bienvenue expliquant les bases de ce que l'on peut faire dans la console
* [x] Ajouter une fonction dagda.help() qui affiche le détail des fonctions disponibles (le texte est fourni par le développeur quand il enregistre les routes/actions)
* [x] Supprimer MQTT.publish, le but c'est d'utiliser data.routes.publish()

## UI
* [x] Ne pas mettre tous les toasts en rouge. Distinguer si ça se passe bien (success), si ça se passe mal (danger), si c'est une information (primary).
* [x] Menu de navigation : Laisse l'icône plier / déplier au même endroit (à gauche) pour ne pas qu'elle bouge quand on déplie
* [x] Si possible, met le thème dans les préférences utilisateur (déjà le cas depuis la tranche 4 — le sélecteur de thème vit sur la page Préférences)

## Editeur Monaco
* [x] Dans l'éditeur binder les raccourcis claviers (Cmd + Ctrl S) depuis l'éditeur + le menu des actions (F1, Cmd-P, Ctrl-P) — Cmd/Ctrl+S câblé ; F1/Cmd-P/Ctrl-P sont déjà les défauts Monaco, rien ne les désactivait
* [ ] Activer la completion HTML pour les dashboard (si possible permettre la completion avec les balises existantes) — **reporté**, voir note en bas de fichier
* [x] Utiliser un thème adapté au thème choisi par l'utilisateur (pas besoin qu'il soit identique)

## Dashboard
* [x] Le partage doit être public (on partage un dashboard pour tout le monde)
* [x] Chaque utilisateur doit pouvoir importer ou non un dashboard partagé
* [x] Le bouton éditer ne doit pas être disponible tant qu'on n'a pas de dashboard
* [x] Seul le propriétaire du dashboard peut l'éditer

## Page publier
* [x] Supprimer l'entrée QoS vide (ça ne marche pas quand on la sélectionne)

## Permissions
* [x] Ajoute des permissions pour toutes les pages & actions de l'application — voir note en bas de fichier

---

**Notes de fin de phase :**
- Completion HTML Monaco pour les tags de dashboard : reporté. Le fournisseur de complétion HTML de Monaco ne branche pas facilement sur une liste de tags custom sans un module dédié (idempotence de `registerCompletionItemProvider`, liste de tags à faire remonter depuis l'app) — à reprendre dans une prochaine passe si toujours utile.
- Permissions : la vraie faille était les 4 actions de publication (`publishMessage`/`schedulePublish`/`cancelScheduledPublish`/`listScheduledPublishes`), qui n'avaient aucune vérification serveur — corrigé avec un nouveau `publish.send`. Les pages `status`/`topicHistory`/`dashboard` (lecture) et `préférences` (personnel) restent volontairement ouvertes à tout compte authentifié, même principe que `listUserNames()` — pas de permission ajoutée pour elles, cohérent avec ce qui existait déjà avant cette passe.
