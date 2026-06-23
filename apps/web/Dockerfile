FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

RUN pnpm --filter @jw-reminders/web build

ENV NODE_ENV=production
EXPOSE 3001
CMD ["pnpm", "--filter", "@jw-reminders/web", "start"]
