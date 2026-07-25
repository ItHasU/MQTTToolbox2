# MQTTToolbox2

Réécriture de MQTTToolbox sur le framework [Dagda](../dagda).
Périmètre visé : [FEATURES.md](FEATURES.md).

## Structure

Trois paquets, comme toute application Dagda :

- `shared/` — le contrat typé (modèle d'entités, contextes, événements). Importé
  par les deux autres, c'est lui qui donne l'autocomplétion aux deux bouts.
- `client/` — la SPA.
- `server/` — le serveur HTTP, la connexion au broker et la persistance.

## Lien avec le framework

Le framework vit dans un **dépôt voisin**, référencé par des dépendances
`file:../dagda/packages/*`. Deux conséquences :

- les deux dépôts doivent être côte à côte sur le disque
  (`.../Projects/dagda` et `.../Projects/MQTTToolbox2`) ;
- **`npm install` doit avoir été lancé dans `dagda` aussi.** Les dépendances du
  framework (express, pg, ws) sont résolues depuis son propre `node_modules` :
  npm considère qu'un paquet lié apporte les siennes.

## Développer

```bash
npm install
cp .env.example .env

# Obligatoire : protège les paramètres secrets au repos. Le serveur refuse
# de démarrer sans, et la configuration du broker en contient un.
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
# → à reporter dans SECRET_KEY dans .env

npm run dev            # base + broker + compilation continue + serveur
```

`npm run dev` démarre PostgreSQL et un broker Mosquitto de développement, puis
compile en continu. Le navigateur n'est pas rechargé automatiquement.

| Commande | Effet |
|---|---|
| `npm run build` | Compile les trois paquets |
| `npm run typecheck` | Vérifie le typage |
| `npm test` | Tests unitaires (Vitest), dont ceux qui exigent PostgreSQL |
| `npm run db:up` / `db:down` | Démarre / arrête base et broker |

Les ports diffèrent de ceux du framework (base sur 5433) pour que les deux
piles puissent tourner en même temps.

## Configuration

Deux niveaux, et la frontière compte (Dagda FEATURES §11.5) :

- **Variables d'environnement** — uniquement l'amorçage : port, URL de base,
  chaîne de connexion, clé de chiffrement. On ne peut pas lire en base de quoi
  se connecter à la base.
- **Paramètres système** — tout le reste, dont le broker. Stockés en base,
  modifiables à chaud : changer l'URL du broker reconnecte sans redémarrage.

L'écran d'édition attend les rôles (tranche 3). En attendant, les variables
`MQTT_*` et `HISTORY_*` **amorcent** les paramètres au **premier** démarrage
seulement. Ensuite la valeur stockée gagne, et le serveur le dit au démarrage :

```
Setting "mqtt.url": MQTT_URL is set but a value is already stored, the environment is ignored
```

Pour repartir de zéro sur un paramètre : `DELETE FROM system_settings WHERE
"key" = 'mqtt.url'`.

## Vérifier que la chaîne fonctionne

```bash
npm run dev
docker compose exec mosquitto mosquitto_pub -t "home/kitchen/temp" -m "21.5"
docker compose exec postgres psql -U mqtt -d mqtt \
  -c 'SELECT t."name", m."payload" FROM data_messages m JOIN data_topics t ON t."id" = m."topicId"'
```

L'interface, elle, n'est pas encore atteignable : la porte d'authentification
redirige tout vers `/login`, et aucune stratégie n'est enregistrée tant que les
comptes locaux ne sont pas là (tranche 3).
