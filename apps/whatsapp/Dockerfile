FROM node:20-slim
RUN apt-get update && apt-get install -y openssl python3 make g++ fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 libgtk-3-0 libnss3 libpango-1.0-0 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 xdg-utils ca-certificates --no-install-recommends && rm -rf /var/lib/apt/lists/*
# ponytail: NO usar chromium del sistema (v150 crashea en VPS). Puppeteer descarga su propio Chrome estable.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json packages/shared/tsconfig.json ./packages/shared/
COPY apps/whatsapp/package.json ./apps/whatsapp/

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/ ./packages/
COPY apps/whatsapp/ ./apps/whatsapp/

RUN pnpm --filter @jw-reminders/shared build
RUN pnpm --filter @jw-reminders/database generate
RUN pnpm --filter @jw-reminders/whatsapp build

ENV NODE_ENV=production
EXPOSE 3010
VOLUME ["/app/apps/whatsapp/.wwebjs_auth"]
WORKDIR /app/apps/whatsapp
CMD ["node", "dist/index.js"]
