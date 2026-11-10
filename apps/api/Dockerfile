# NURIVA API. Build from the repository root:  docker build -f apps/api/Dockerfile .
# BASE can be overridden for local builds behind a proxy; hosting builds use the default.
ARG BASE=node:22-bookworm-slim
FROM ${BASE}
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
ENV NODE_ENV=production
USER node
EXPOSE 10000
# Database migrations run as a separate step before each deploy:
#   node_modules/.bin/tsx packages/db/src/migrate.ts
CMD ["node_modules/.bin/tsx", "apps/api/src/server.ts"]
