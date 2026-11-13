# syntax=docker/dockerfile:1
FROM node:24.22.1-slim AS build
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --include=dev --no-audit --no-fund
COPY . .
ARG VITE_FIREBASE_MODE=emulator
RUN VITE_FIREBASE_MODE=${VITE_FIREBASE_MODE} npm run build

FROM node:24.22.1-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/build ./build
COPY --chown=node:node --from=build /app/scripts/start.mjs ./scripts/start.mjs
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "build/server.cjs"]
