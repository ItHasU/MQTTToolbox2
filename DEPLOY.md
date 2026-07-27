# Déploiement (Linux, image Docker)

L'image est construite et publiée par `.github/workflows/docker.yml` sur
`ghcr.io/ithasu/mqtttoolbox2`, une par branche (voir ce fichier pour le détail).
Le dépôt GitHub étant privé, l'image l'est aussi par défaut : il faut
s'authentifier pour la récupérer, même en lecture seule.

## 1. Docker sur la machine Linux

Si Docker (avec le plugin Compose) n'est pas déjà installé :

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"
# se reconnecter (ou `newgrp docker`) pour que le groupe soit pris en compte
```

Vérifier : `docker compose version` doit répondre (pas `docker-compose`,
le plugin intégré).

## 2. Un jeton d'accès

Le dépôt est privé (code **et** image), donc `GITHUB_TOKEN` (utilisé par le
workflow lui-même) ne sert à rien ici — il faut un jeton personnel, avec
deux droits : lire les packages (pour l'image) et lire le code (pour les
deux fichiers de déploiement).

1. GitHub → **Settings** → **Developer settings** → **Personal access
   tokens** → **Tokens (classic)** → **Generate new token**.
2. Scopes : `read:packages` **et** `repo` (`repo` en classique donne accès
   en lecture à tous vos dépôts privés — c'est la contrepartie de la
   simplicité ; passer par un jeton *fine-grained* limité à ce seul dépôt
   si vous préférez éviter ça, au prix d'un réglage un peu plus long).
3. Copier le jeton (il ne sera plus jamais affiché).

```bash
export GITHUB_PAT="votre_jeton"
echo "$GITHUB_PAT" | docker login ghcr.io -u VOTRE_LOGIN_GITHUB --password-stdin
```

`docker login` retient les identifiants dans `~/.docker/config.json` — à
refaire une seule fois par machine, pas à chaque déploiement.

## 3. Récupérer les fichiers de déploiement

Seuls deux fichiers du dépôt sont nécessaires sur le serveur, pas tout le
code — mais comme il est privé, `curl` sur une URL `raw.githubusercontent.com`
ne fonctionnera pas sans authentification ; le plus fiable reste un clone
Git superficiel (le jeton sert de mot de passe) :

```bash
git clone --depth 1 --branch spec/reboot \
  "https://${GITHUB_PAT}@github.com/ItHasU/MQTTToolbox2.git" mqtt-toolbox2-src
cd mqtt-toolbox2-src
cp docker-compose.prod.yml .env.prod.example ..
cd .. && rm -rf mqtt-toolbox2-src
```

(Remplacer `spec/reboot` par la branche voulue une fois le travail fusionné
dans `main`.)

## 4. Configurer

```bash
cp .env.prod.example .env.prod
```

Éditer `.env.prod` :

- `MQTT_BASE_URL` — l'adresse réellement joignable de ce serveur (pas
  `localhost`), utilisée pour construire les liens d'invitation envoyés aux
  comptes.
- `MQTT_SECRET_KEY` — générer avec :
  ```bash
  docker run --rm node:24-alpine node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
  ```
- `MQTT_DB_PASSWORD` — changer la valeur par défaut avant un vrai
  déploiement.
- `MQTT_IMAGE_TAG` — quelle branche/tag tirer (voir le commentaire dans le
  fichier).

## 5. Démarrer

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f app
```

Le dernier `logs -f` doit finir par `Server listening on port 3000`. `Ctrl+C`
pour arrêter de suivre les logs sans arrêter le service.

## 6. Première connexion

`http://<MQTT_BASE_URL>` → compte `admin` / `admin`, créé automatiquement au
premier démarrage sur une base vide. **Changer ce mot de passe
immédiatement** (Préférences), le serveur le rappelle dans ses logs tant
que ce n'est pas fait.

## 7. Configurer le broker MQTT

L'URL, les identifiants et les topics du broker sont des **paramètres
système**, pas des variables d'environnement : Paramètres (menu secondaire,
réservé à `settings.manage` — l'admin l'a par défaut) → renseigner le
broker réel. Le `mosquitto` inclus dans `docker-compose.prod.yml` n'est
qu'un dépannage — le retirer et pointer vers votre broker existant si vous
en avez déjà un (voir le commentaire du service dans le fichier).

## Mettre à jour

Une nouvelle image poussée sur la même branche remplace le tag existant —
pas de changement de `.env.prod` nécessaire pour une mise à jour normale :

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Les migrations de schéma s'appliquent automatiquement au démarrage
(visible dans les logs : `Applying app migration "..."`).

## Sauvegarder

Tout l'état (comptes, dashboards, historique des messages, paramètres) vit
dans le volume `postgres-data` du service `postgres` :

```bash
# Reads POSTGRES_USER/POSTGRES_DB from *inside* the container rather than
# relying on the calling shell already having MQTT_DB_USER/MQTT_DB_NAME set.
docker compose -f docker-compose.prod.yml --env-file .env.prod exec postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql
```
