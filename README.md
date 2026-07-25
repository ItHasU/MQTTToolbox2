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
npm run dev            # base + broker + compilation continue + serveur
```

`npm run dev` démarre PostgreSQL et un broker Mosquitto de développement, puis
compile en continu. Le navigateur n'est pas rechargé automatiquement.

| Commande | Effet |
|---|---|
| `npm run build` | Compile les trois paquets |
| `npm run typecheck` | Vérifie le typage |
| `npm test` | Tests unitaires (Vitest) |
| `npm run db:up` / `db:down` | Démarre / arrête base et broker |

Les ports diffèrent de ceux du framework (base sur 5433) pour que les deux
piles puissent tourner en même temps.
