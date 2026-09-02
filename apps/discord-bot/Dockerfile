# 대시보드와 별도 이미지다. 한쪽이 죽어도 다른 쪽이 영향받지 않아야 한다.
FROM node:20-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/discord-bot/package.json apps/discord-bot/
RUN npm ci

FROM deps AS runner
COPY . .
# 빌드 전용 더미 값 — 런타임에는 Compose가 실제 DATABASE_URL로 덮어쓴다.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
RUN npx prisma generate --schema packages/db/prisma/schema.prisma
ENV NODE_ENV=production
WORKDIR /app/apps/discord-bot
# 봇은 마이그레이션을 실행하지 않는다. 스키마 적용은 대시보드 컨테이너의 몫이다.
CMD ["npx", "tsx", "src/index.ts"]
