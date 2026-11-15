# One image for the API, the showroom and the admin; docker-compose.prod.yml picks the command per service.
FROM node:24-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@9.15.9 && mkdir -p /app && chown node:node /app
USER node
WORKDIR /app

COPY --chown=node:node . .
RUN pnpm install --frozen-lockfile

# Empty means the browser calls /api and /media on the page's own origin (Caddy routes them to the API).
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @synapse/showroom --filter @synapse/admin build && mkdir -p .data storage

ENV NODE_ENV=production
