# NURIVA admin app. Build from the repository root:  docker build -f apps/admin/Dockerfile .
# BASE can be overridden for local builds behind a proxy; hosting builds use the default.
ARG BASE=node:22-bookworm-slim
FROM ${BASE}
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @nuriva/admin build && chown -R node:node apps/admin/.next
ENV NODE_ENV=production
USER node
WORKDIR /app/apps/admin
EXPOSE 3000
CMD ["sh", "-c", "exec node_modules/.bin/next start -p ${PORT:-3000}"]
