FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/types/package.json ./packages/types/
COPY packages/engine-contracts/package.json ./packages/engine-contracts/
COPY packages/mini-brain-sdk/package.json ./packages/mini-brain-sdk/
COPY packages/mini-brain-server/package.json ./packages/mini-brain-server/
COPY packages/brain-sdk/package.json ./packages/brain-sdk/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build --filter=web

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public
# Include migration files for auto-migration on startup
COPY --from=builder /app/packages/db/drizzle ./packages/db/drizzle
COPY --from=builder /app/packages/db/src/migrate.ts ./packages/db/src/migrate.ts
COPY --from=builder /app/packages/db/package.json ./packages/db/package.json
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
