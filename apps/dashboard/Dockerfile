# 빌드 컨텍스트는 리포 루트다 (compose의 context: .).
# npm workspaces 구조라 루트 package-lock.json으로 한 번에 설치한다.
FROM node:20-bookworm-slim AS base
# Prisma 쿼리 엔진이 OpenSSL을 필요로 한다.
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

FROM deps AS build
COPY . .
# next build 중에는 DB에 접속하지 않지만, Prisma 클라이언트 초기화가
# DATABASE_URL의 존재를 요구한다. 빌드 전용 더미 값이다.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
RUN npx prisma generate --schema packages/db/prisma/schema.prisma
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=dashboard

FROM build AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/apps/dashboard
EXPOSE 3200
# 마이그레이션이 실패하면 컨테이너는 기동하지 않는다 — 스키마가 어긋난 채로
# 서비스가 뜨는 것보다 낫다.
CMD ["sh", "-c", "npx prisma migrate deploy --schema ../../packages/db/prisma/schema.prisma && npx next start -p 3200"]
