FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY apps/worker/package.json ./apps/worker/

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/ ./packages/
COPY apps/worker/ ./apps/worker/

RUN pnpm --filter @jw-reminders/database generate
RUN pnpm --filter @jw-reminders/worker build

ENV NODE_ENV=production
CMD ["node", "apps/worker/dist/index.js"]
