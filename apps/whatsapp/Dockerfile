FROM node:20-slim
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY apps/whatsapp/package.json ./apps/whatsapp/

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/ ./packages/
COPY apps/whatsapp/ ./apps/whatsapp/

RUN pnpm --filter @jw-reminders/database generate
RUN pnpm --filter @jw-reminders/whatsapp build

ENV NODE_ENV=production
EXPOSE 3010
VOLUME ["/app/apps/whatsapp/.wwebjs_auth"]
WORKDIR /app/apps/whatsapp
CMD ["node", "dist/index.js"]
