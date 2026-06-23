FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

RUN pnpm --filter @jw-reminders/database generate
RUN pnpm --filter @jw-reminders/api build

ENV NODE_ENV=production
EXPOSE 4000

CMD sh -c "cd packages/database && npx prisma migrate deploy && npx tsx prisma/seed.ts; cd /app && node apps/api/dist/server.js"
