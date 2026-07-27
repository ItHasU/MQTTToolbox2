# syntax=docker/dockerfile:1.7
#
# Built with a context of the *parent* directory containing this repo and
# `dagda` as siblings (see .github/workflows/docker.yml) — MQTTToolbox2's
# own package.json files depend on Dagda via file:../../dagda/packages/*
# paths, so the build needs Dagda's source right next to this checkout, the
# same layout local development already assumes.
#
#   docker build -f MQTTToolbox2/Dockerfile -t mqtt-toolbox2 .
#   (run from the directory that contains both `dagda/` and `MQTTToolbox2/`)

FROM node:24-alpine AS builder
WORKDIR /workspace

# Dagda first, and installed on its own: it is a real sibling npm workspace,
# not vendored into this one, so it needs its own node_modules the same way
# it would for local development.
COPY dagda ./dagda
RUN --mount=type=cache,target=/root/.npm \
    cd dagda && npm ci

# Its own typecheck run (`tsc -b`) is what actually emits the .d.ts/.tsbuildinfo
# a *composite* TS project reference resolves against — MQTTToolbox2's own
# tsconfig files reference Dagda's packages directly, so without this the
# build below fails to resolve @dagda/* types even though the source is
# right there.
RUN cd dagda && npm run typecheck

COPY MQTTToolbox2 ./MQTTToolbox2
RUN --mount=type=cache,target=/root/.npm \
    cd MQTTToolbox2 && npm ci
RUN cd MQTTToolbox2 && npm run build

# webpack's server config bundles every dependency reached *through* a local
# (file:) package — Dagda's own express/pg/ws/etc. included — but leaves
# MQTTToolbox2's *own* direct registry dependencies (currently just `mqtt`)
# external, so they resolve from node_modules at runtime instead
# (dagda/packages/build/webpack-server.config.js explains why). `npm prune
# --omit=dev` strips the build-only tooling (webpack, ts-loader, monaco's
# webpack plugin, vitest, ...) while leaving `mqtt` in place — ~250MB down
# to ~13MB in testing.
RUN cd MQTTToolbox2 && npm prune --omit=dev

# ---- Runtime ----
# The client build is plain static assets. The server bundle needs its own
# node_modules alongside it for the handful of externalized dependencies
# above — everything else Dagda itself needs is already inside dist/main.js.
FROM node:24-alpine AS runtime
WORKDIR /app
COPY --from=builder /workspace/MQTTToolbox2/server/dist ./server/dist
COPY --from=builder /workspace/MQTTToolbox2/client/dist ./client/dist
COPY --from=builder /workspace/MQTTToolbox2/node_modules ./node_modules

# DEFAULT_SERVER_PARAMS.staticFolder is "../client/dist", resolved against
# the process cwd — matching the same server/ vs client/ sibling layout
# `npm start` relies on locally, not an absolute path baked into the image.
WORKDIR /app/server

# Bootstrap-only configuration (Dagda FEATURES §11.5) — everything else
# (broker URL, retention, ...) is a system setting stored in the database,
# editable from the Paramètres screen after first boot, not an env var here.
#   APP_PORT, APP_BASE_URL, APP_DATABASE_URL, APP_SECRET — see .env.example.
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/main.js"]
