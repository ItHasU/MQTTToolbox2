# Dagda

## Services (refactor)

* [ ] Maintenant que la liste de services est constante, ne pas mettre get() utiliser les services, plutôt les exposer directement (soit avec un proxy, soit mettre toutes les variables directement)
* [ ] Uniformiser l'accès côté client / script / serveur : "dagda", "Dagda" => "dagda"
  * On garde la classe utilitaire "Dagda" contenant des méthodes statiques
  * On créer une variable globale "dagda" côté client/serveur/script constante qui contient la version "typée" de la classe initialisée
* [ ] Les permissions doivent faire partie des types de base
* [ ] UserInfos.permissions devrait être du type des permissions de l'app, pas juste un string.

## UI (small changes)

* [ ] Ajouter des variantes de couleur success, info, warning, danger
* [ ] Créer des classes utilitaire pour l'espacement m-x, p-x
* [ ] Crée un thème "Frenchy" sur une base de couleurs "bleu-blanc-rouge" avec un bleu plutôt bleu marine
* [ ] Gère la navigation avec les boutons de navigation du navigateur

## Page - Edition des utilisateurs (small changes)

* [ ] Permettre de modifier le flag super-utilisateurs sur les utilisateurs
* [ ] Permettre de renommer un utilisateur

## Page - Edition des rôles (small changes)

* [ ] Ne pas mettre la liste de rôle lors de la création (juste demander le nom)
* [ ] Permettre un scroll horizontal quand on a beaucoup de rôles

## API (refactor)

* [ ] Faisons la distinction entre l'API standard de dagda (infos system, fetch, submit, ...)
  * Mettons les routes système dans dagda.system.xxx()
  * Mettons les routes personnalisées dans dagda.api.xxx()
  * Les routes systèmes et personnalisées doivent être énumérables depuis la console
* [ ] Les apis pourront à terme être appelées depuis :
  * Le client
  * Le serveur lui même (appel de la fonction en direct)
  * Les scripts utilisateur
  * Appel HTTP externe (par exemple avec curl) en utilisant un token lié à l'utilisateur
* [ ] Sécurisation
  * La configuration de l'API contiendra un type INTERNAL (client, serveur, scripts - par défaut) / EXTERNAL (API) / BOTH
  * Chaque API peut être liée à une fonction de permission qui évalue si l'utilisateur a le droit d'exécuter la fonction selon ses permissions et les paramètres de la fonction (par exemple : il peut avoir le droit de faire une action sur ses entités mais pas sur celles des autres utilisateurs)

## Actions (refactor)

Concepts clés de la manipulation d'entités :
* Toutes les manipulations sur les entités (lecture, modification via les transactions) sont synchrones.
* La méthode encapsulate permet d'avoir une transaction pour faire des modifications, mais est elle aussi synchrone.
* Si jamais on veut réellement attendre que les modifications soient réalisées par le serveur, il existe une méthode d'attente.
* Les fetch d'entités sont toujours fait en dehors des manipulations sur le modèle. C'est au développeur de faire les bons fetch au moment du refresh de la page.

* [ ] Renommer actions -> model, ce sont des fonctions qui vont permettre d'agir sur le modèle de données
  * Soit en récupérant des informations depuis le cache (soit les entités, soit une valeur calculée à partir des entités)
  * Soit en modifiant les entités (succession de modifications appliquées sur les entités grâce à une transaction)
  * Le "model" doit être typé de manière à ce qu'on ait de la completion dans VSCode en TypeScript
  * La liste des fonctions doit être itérable côté client (même si on utilise un proxy) pour qu'on ait de la completion dans la console du navigateur

# MQTTToolbox 2

## Dashboard (small changes)

* [ ] L'éditeur de dashboard ne fait pas de coloration sur le HTML

## Intégration framework (refactor ?)

* [ ] Ajouter les permissions de l'application dans la page de gestion des rôles
