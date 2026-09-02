# OCI Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드·디스코드 봇·Postgres를 OCI 인스턴스에 Docker Compose로 상시 배포하고, 로컬 개발 DB의 데이터를 그대로 옮긴다.

**Architecture:** 리포 루트를 빌드 컨텍스트로 쓰는 Dockerfile 두 개(대시보드, 봇)를 만들고, `docker-compose.prod.yml`로 Postgres까지 세 컨테이너를 띄운다. 이미지 빌드는 **서버에서** 수행한다 — 서버가 ARM64이고 Prisma는 아키텍처별 엔진 바이너리를 쓰기 때문이다. 소스는 `git archive`로 밀어넣어 서버에 GitHub 자격증명을 두지 않는다.

**Tech Stack:** Docker + Docker Compose(서버에 이미 설치됨), `node:20-bookworm-slim`, Prisma `migrate deploy`, `pg_dump`/`psql`.

**Spec:** `docs/superpowers/specs/2026-08-30-admin-auth-and-oci-deployment-design.md`

**선행 조건:** `docs/superpowers/plans/2026-08-30-admin-auth-implementation.md`가 완료돼 있어야 한다. 인증 없이 3200을 공개하면 누구나 데이터를 지울 수 있다.

## Global Constraints

- 대상 서버: Ubuntu 24.04, **aarch64(ARM64)**, vCPU 1개, RAM 5.9GB. 호스트에 Node.js가 없으므로 모든 빌드는 컨테이너 안에서 한다.
- 접속 정보는 리포 루트 `.env`의 `OCI_INSTANCE_IP`, `OCI_INSTANCE_SSH_PORT`, `OCI_INSTANCE_SSH_USER`, `OCI_INSTANCE_SSH_KEY_PATH`, `OCI_INSTANCE_SERVICE_PORT`(=3200)에 있다.
- 서버에는 이미 다른 프로젝트가 80/443(Caddy), 3000, 3100을 쓰고 있다. **3200 외의 호스트 포트를 점유하지 않는다.** Postgres는 호스트 포트를 노출하지 않는다.
- 서버 배포 디렉터리는 `~/lolpamin`, Compose 프로젝트 이름은 `lolpamin`으로 고정한다. 기존 프로젝트의 컨테이너·볼륨과 이름이 겹치지 않아야 한다.
- 비밀값(`.env`)은 git에 넣지 않는다. 커밋되는 것은 `.env.prod.example`뿐이다.
- 같은 디스코드 봇 토큰으로 두 프로세스를 동시에 띄우지 않는다.

---

## File Structure

```
.dockerignore                       # 신규: 빌드 컨텍스트에서 제외할 것
docker-compose.prod.yml             # 신규: postgres + dashboard + discord-bot
.env.prod.example                   # 신규: 서버 .env 템플릿 (비밀값 없음)
apps/dashboard/Dockerfile           # 신규
apps/discord-bot/Dockerfile         # 신규
```

서버:

```
~/lolpamin/                         # git archive로 푼 소스
~/lolpamin/.env                     # scp로 전달 (git에 없음)
```

---

### Task 1: 대시보드 이미지

**Files:**
- Create: `apps/dashboard/Dockerfile`
- Create: `.dockerignore` (리포 루트)

**Interfaces:**
- Consumes: 없음
- Produces: 리포 루트를 컨텍스트로 빌드되는 이미지. `3200` 포트로 서비스하고, 기동 시 `prisma migrate deploy`를 먼저 실행한다. Task 3의 compose 파일이 참조한다.

- [ ] **Step 1: `.dockerignore` 작성**

`.dockerignore`:

```
.git
node_modules
**/node_modules
.next
**/.next
dist
**/dist
**/*.tsbuildinfo
# 실제 카카오톡 대화 내보내기 — 이미지에 들어가면 안 된다
data
# 비밀값과 개인키
.env
*.key
*.pem
```

- [ ] **Step 2: Dockerfile 작성**

`apps/dashboard/Dockerfile`:

```dockerfile
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
RUN npx prisma generate --schema packages/db/prisma/schema.prisma
# next build 중에는 DB에 접속하지 않지만, Prisma 클라이언트 초기화가
# DATABASE_URL의 존재를 요구한다. 빌드 전용 더미 값이다.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
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
```

- [ ] **Step 3: 커밋**

```bash
git add .dockerignore apps/dashboard/Dockerfile
git commit -m "build(dashboard): add production image"
```

---

### Task 2: 디스코드 봇 이미지

**Files:**
- Create: `apps/discord-bot/Dockerfile`

**Interfaces:**
- Consumes: 없음
- Produces: 리포 루트를 컨텍스트로 빌드되는 봇 이미지. 포트를 열지 않는다. Task 3의 compose 파일이 참조한다.

- [ ] **Step 1: Dockerfile 작성**

`apps/discord-bot/Dockerfile`:

```dockerfile
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
RUN npx prisma generate --schema packages/db/prisma/schema.prisma
ENV NODE_ENV=production
WORKDIR /app/apps/discord-bot
# 봇은 마이그레이션을 실행하지 않는다. 스키마 적용은 대시보드 컨테이너의 몫이다.
CMD ["npx", "tsx", "src/index.ts"]
```

- [ ] **Step 2: 커밋**

```bash
git add apps/discord-bot/Dockerfile
git commit -m "build(discord-bot): add production image"
```

---

### Task 3: 운영용 Compose 파일과 환경변수 템플릿

**Files:**
- Create: `docker-compose.prod.yml`
- Create: `.env.prod.example`

**Interfaces:**
- Consumes: Task 1·2의 두 Dockerfile.
- Produces: `docker compose -f docker-compose.prod.yml`로 띄우는 `postgres` / `dashboard` / `discord-bot` 세 서비스. Task 5~7이 이 파일로 조작한다.

- [ ] **Step 1: Compose 파일 작성**

`docker-compose.prod.yml`:

```yaml
name: lolpamin

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: lolpamin
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set in .env}
      POSTGRES_DB: lolpamin
    volumes:
      - pgdata:/var/lib/postgresql/data
    # 호스트 포트를 열지 않는다. 서버에 이미 다른 Postgres가 세 개 떠 있고,
    # 외부에서 DB에 직접 붙을 경로를 만들 이유가 없다.
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lolpamin -d lolpamin"]
      interval: 10s
      timeout: 5s
      retries: 10

  dashboard:
    build:
      context: .
      dockerfile: apps/dashboard/Dockerfile
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    env_file: .env
    environment:
      DATABASE_URL: postgresql://lolpamin:${POSTGRES_PASSWORD}@postgres:5432/lolpamin
    ports:
      - "3200:3200"

  discord-bot:
    build:
      context: .
      dockerfile: apps/discord-bot/Dockerfile
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    env_file: .env
    environment:
      DATABASE_URL: postgresql://lolpamin:${POSTGRES_PASSWORD}@postgres:5432/lolpamin

volumes:
  pgdata:
```

- [ ] **Step 2: 서버 `.env` 템플릿 작성**

`.env.prod.example`:

```
# 서버(~/lolpamin/.env)용 템플릿. 실제 값이 든 .env는 절대 커밋하지 않는다.

# Postgres 컨테이너 비밀번호. 아무 긴 문자열이면 된다 (외부에 노출되지 않는다).
POSTGRES_PASSWORD=""

# 디스코드 봇 — 로컬 .env의 값과 동일하다.
DISCORD_APP_ID=""
DISCORD_PUBLIC_KEY=""
DISCORD_TOKEN=""
DISCORD_GUILD_ID=""

# 최초 관리자 1회 생성용. 로그인 확인 후 두 줄을 지우고 대시보드를 재시작한다.
ADMIN_BOOTSTRAP_USERNAME=""
ADMIN_BOOTSTRAP_PASSWORD=""

# 평문 HTTP로 서비스하는 동안은 false여야 한다. true로 두면 쿠키가 전송되지 않아 로그인이 되지 않는다.
COOKIE_SECURE="false"
```

- [ ] **Step 3: Compose 파일 문법 검증**

Run: `docker compose -f docker-compose.prod.yml --env-file .env.prod.example config > /dev/null && echo OK`
Expected: `OK`. (로컬 Docker Desktop이 꺼져 있으면 이 단계는 서버에서 대신 확인한다.)

- [ ] **Step 4: 커밋**

```bash
git add docker-compose.prod.yml .env.prod.example
git commit -m "build: add production compose stack"
```

---

### Task 4: 서버로 소스와 환경변수 전달

**Files:** 없음 — 로컬에서 명령을 실행한다.

**Interfaces:**
- Consumes: Task 1~3의 커밋된 파일들.
- Produces: 서버 `~/lolpamin/`에 소스와 `.env`가 놓인 상태. Task 5가 여기서 빌드한다.

- [ ] **Step 1: 접속 변수 준비**

리포 루트(Git Bash)에서:

```bash
export OCI_IP=$(grep '^OCI_INSTANCE_IP=' .env | cut -d= -f2- | tr -d '"')
export OCI_PORT=$(grep '^OCI_INSTANCE_SSH_PORT=' .env | cut -d= -f2- | tr -d '"')
export OCI_USER=$(grep '^OCI_INSTANCE_SSH_USER=' .env | cut -d= -f2- | tr -d '"')
export OCI_KEY=$(grep '^OCI_INSTANCE_SSH_KEY_PATH=' .env | cut -d= -f2- | tr -d '"' | sed 's|\\\\|/|g')
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'echo connected'
```

Expected: `connected`

- [ ] **Step 2: 배포 디렉터리 만들고 소스 밀어넣기**

```bash
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'mkdir -p ~/lolpamin'
git archive HEAD | ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'tar x -C ~/lolpamin'
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'ls ~/lolpamin && ls ~/lolpamin/apps'
```

Expected: `docker-compose.prod.yml`, `package.json`, `apps/`, `packages/` 등이 보이고, `apps/`에는 `dashboard`와 `discord-bot`이 있다. `.env`, `data/`, `node_modules/`는 **없어야 한다**.

- [ ] **Step 3: 서버 `.env` 작성**

로컬에서 서버용 `.env`를 만든다 (리포 밖 임시 경로에 만들고, 다 쓰면 지운다):

```bash
TMP_ENV=$(mktemp)
{
  echo "POSTGRES_PASSWORD=\"$(openssl rand -hex 24)\""
  grep '^DISCORD_' .env
  echo 'ADMIN_BOOTSTRAP_USERNAME="admin"'
  echo "ADMIN_BOOTSTRAP_PASSWORD=\"$(openssl rand -base64 18)\""
  echo 'COOKIE_SECURE="false"'
} > "$TMP_ENV"
cat "$TMP_ENV"   # 부트스트랩 비밀번호를 여기서 복사해 둔다 — 첫 로그인에 쓴다
scp -i "$OCI_KEY" -P "$OCI_PORT" "$TMP_ENV" "$OCI_USER@$OCI_IP:~/lolpamin/.env"
rm "$TMP_ENV"
```

Expected: 서버 `~/lolpamin/.env`가 생긴다. 출력된 `ADMIN_BOOTSTRAP_PASSWORD` 값을 기록해 둔다.

- [ ] **Step 4: 서버에서 파일 권한 조이기**

```bash
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'chmod 600 ~/lolpamin/.env && ls -l ~/lolpamin/.env'
```

Expected: `-rw------- 1 ubuntu ubuntu ... .env`

---

### Task 5: 서버에서 빌드하고 기동

**Files:** 없음 — 서버에서 명령을 실행한다.

**Interfaces:**
- Consumes: Task 4가 올려둔 소스와 `.env`.
- Produces: Compose 프로젝트 `lolpamin`의 세 서비스(`postgres`, `dashboard`, `discord-bot`)가 떠 있는 상태 — 컨테이너 이름은 `lolpamin-postgres-1` 형태가 된다. Task 6이 여기에 데이터를 넣는다.

- [ ] **Step 1: 이미지 빌드**

```bash
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'cd ~/lolpamin && docker compose -f docker-compose.prod.yml build'
```

Expected: 두 이미지가 빌드된다. vCPU 1개라 첫 빌드는 5~15분 걸릴 수 있다. `npm ci`와 `next build`가 성공해야 한다.

빌드가 메모리 부족(OOM)으로 죽으면, `next build` 단계에 `ENV NODE_OPTIONS=--max-old-space-size=2048`을 대시보드 Dockerfile의 build 스테이지에 추가하고 다시 빌드한다.

- [ ] **Step 2: 기동**

```bash
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'cd ~/lolpamin && docker compose -f docker-compose.prod.yml up -d'
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'cd ~/lolpamin && docker compose -f docker-compose.prod.yml ps'
```

Expected: 세 서비스가 `running` 상태. `postgres`는 `healthy`.

- [ ] **Step 3: 마이그레이션과 부트스트랩 로그 확인**

```bash
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'cd ~/lolpamin && docker compose -f docker-compose.prod.yml logs dashboard | tail -30'
```

Expected: `prisma migrate deploy`가 마이그레이션 3건(init, add_member_age, add_admin_auth)을 적용했다는 로그, 이어서 `[bootstrap] 최초 관리자 "admin" 생성됨`, 그리고 Next.js `ready` 로그.

- [ ] **Step 4: 봇 로그 확인**

```bash
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'cd ~/lolpamin && docker compose -f docker-compose.prod.yml logs discord-bot | tail -10'
```

Expected: `Logged in as elo#0646`

**주의:** 이 시점에 로컬에서도 봇이 돌고 있으면 같은 토큰으로 두 세션이 붙는다. Task 7에서 로컬 봇을 끄기 전까지는 디스코드에서 명령어를 테스트하지 않는다.

- [ ] **Step 5: 서버 내부에서 응답 확인**

```bash
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3200/members'
```

Expected: `200`

- [ ] **Step 6: 외부에서 접근 가능한지 확인**

로컬에서:

```bash
curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 "http://$OCI_IP:3200/members"
```

Expected: `200`

`000`(타임아웃)이 나오면 컨테이너 문제가 아니라 방화벽 문제다. 두 군데를 확인한다:

1. 서버 iptables: `ssh ... 'sudo iptables -L INPUT -n --line-numbers | head -20'` — 3000/3100이 열린 방식과 같은 규칙이 3200에도 필요하다.
2. OCI 콘솔의 해당 VCN 서브넷 **Security List / Network Security Group**에 TCP 3200 인그레스 규칙 추가 (이건 웹 콘솔에서 사람이 해야 한다).

---

### Task 6: 로컬 데이터 이관

**Files:** 없음 — 로컬과 서버에서 명령을 실행한다.

**Interfaces:**
- Consumes: Task 5에서 스키마가 적용된 서버 DB.
- Produces: 로컬과 동일한 회원·활동기록·전적 데이터가 든 서버 DB.

- [ ] **Step 1: 이관 전 로컬 기준값 기록**

```bash
docker exec dashboard-implementation-postgres-1 psql -U lolpamin -d lolpamin \
  -c 'SELECT count(*) AS members FROM "Member";' \
  -c 'SELECT count(*) AS logs FROM "MentionLog";' \
  -c 'SELECT count(*) AS games FROM "GameResult";'
```

Expected: 숫자를 적어둔다. (2026-08-30 기준 회원 36 / 활동기록 428 / 전적 0)

- [ ] **Step 2: 데이터만 덤프**

```bash
docker exec dashboard-implementation-postgres-1 pg_dump -U lolpamin \
  --data-only --no-owner --disable-triggers \
  --exclude-table-data='_prisma_migrations' \
  --exclude-table-data='"Admin"' --exclude-table-data='"AdminSession"' \
  lolpamin > /tmp/lolpamin-data.sql
wc -l /tmp/lolpamin-data.sql
```

각 옵션의 이유:
- `--data-only`: 스키마는 서버에서 `prisma migrate deploy`가 이미 만들었다. 스키마까지 덤프하면 충돌한다.
- `--disable-triggers`: `--data-only` 덤프는 테이블을 알파벳 순으로 넣는다. `GameParticipant`가 `GameResult`·`Member`보다 먼저 와서 FK 위반이 나므로, 복원 중 트리거(FK 검사)를 끈다.
- `--exclude-table-data='_prisma_migrations'`: 서버가 자기 마이그레이션 이력을 이미 갖고 있다. 로컬 이력을 밀어넣으면 PK 충돌이 난다.
- 관리자 테이블 제외: 서버 관리자는 부트스트랩으로 이미 만들어졌고, 로컬 개발용 계정을 서버로 옮길 이유가 없다.

- [ ] **Step 3: 서버로 전송하고 복원**

```bash
scp -i "$OCI_KEY" -P "$OCI_PORT" /tmp/lolpamin-data.sql "$OCI_USER@$OCI_IP:/tmp/lolpamin-data.sql"
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" \
  'cd ~/lolpamin && docker compose -f docker-compose.prod.yml exec -T postgres psql -U lolpamin -d lolpamin < /tmp/lolpamin-data.sql | tail -5'
```

Expected: `COPY 36`, `COPY 428` 같은 출력. `ERROR`가 보이면 멈추고 원인을 확인한다.

- [ ] **Step 4: 서버 데이터가 로컬과 일치하는지 확인**

```bash
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" \
  'cd ~/lolpamin && docker compose -f docker-compose.prod.yml exec -T postgres psql -U lolpamin -d lolpamin -c '"'"'SELECT count(*) AS members FROM "Member";'"'"' -c '"'"'SELECT count(*) AS logs FROM "MentionLog";'"'"''
```

Expected: Step 1에서 적어둔 숫자와 정확히 같다.

- [ ] **Step 5: 전송한 덤프 파일 정리**

```bash
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'rm /tmp/lolpamin-data.sql'
rm /tmp/lolpamin-data.sql
```

덤프에는 회원 실명과 카톡 닉네임이 들어 있다. 임시 파일로 남겨두지 않는다.

---

### Task 7: 봇을 서버로 넘기기

**Files:** 없음.

**Interfaces:**
- Consumes: Task 5에서 떠 있는 `discord-bot` 컨테이너.
- Produces: 봇이 서버에서만 도는 상태.

- [ ] **Step 1: 로컬 봇 종료**

로컬에서 봇 프로세스를 찾아 종료한다:

```bash
ps aux | grep -i "tsx.*discord-bot" | grep -v grep
```

찾은 PID를 `taskkill //F //PID <pid>`로 종료한다. (Windows Git Bash 기준. 프로세스가 없으면 이미 꺼진 것이다.)

- [ ] **Step 2: 서버 봇이 유일한 세션인지 확인**

```bash
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'cd ~/lolpamin && docker compose -f docker-compose.prod.yml restart discord-bot && sleep 10 && docker compose -f docker-compose.prod.yml logs --tail 5 discord-bot'
```

Expected: `Logged in as elo#0646`가 한 번 찍힌다.

- [ ] **Step 3: 디스코드에서 명령어 확인**

디스코드에서 `/랭킹`을 실행한다.
Expected: 응답이 **한 번만** 온다. 두 번 오면 아직 어딘가에서 봇이 하나 더 돌고 있는 것이다.

---

### Task 8: 최종 검증과 마무리

**Files:** 없음 — 검증만 한다.

**Interfaces:** 없음.

- [ ] **Step 1: 첫 로그인**

브라우저에서 `http://<OCI_INSTANCE_IP>:3200/login`을 열고, Task 4 Step 3에서 기록해 둔 `admin` / 부트스트랩 비밀번호로 로그인한다.
Expected: `/members`로 이동하고 우상단에 `admin`과 "로그아웃"이 보인다.

- [ ] **Step 2: 비로그인 뷰어 동작 확인**

시크릿 창에서 `http://<OCI_INSTANCE_IP>:3200/members`를 연다.
Expected: 회원 목록은 보이고, 삭제 버튼은 보이지 않으며, `/admins`로 가면 `/login`으로 리다이렉트된다.

- [ ] **Step 3: 본인 계정 만들고 부트스트랩 계정 정리**

`/admins`에서 실제로 쓸 관리자 계정을 하나 추가하고, 그 계정으로 로그인되는지 확인한다. 그 다음 서버 `.env`에서 부트스트랩 두 줄을 지우고 대시보드를 재시작한다:

```bash
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" \
  "sed -i '/^ADMIN_BOOTSTRAP_/d' ~/lolpamin/.env && cd ~/lolpamin && docker compose -f docker-compose.prod.yml up -d dashboard"
```

새로 만든 계정으로 로그인한 뒤 `/admins`에서 `admin` 계정을 삭제한다.
Expected: 삭제되고, `admin`으로는 더 이상 로그인되지 않는다.

- [ ] **Step 4: 재부팅 후 자동 복구 확인**

```bash
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'sudo reboot' || true
```

2~3분 기다린 뒤:

```bash
curl -s -o /dev/null -w "%{http_code}\n" --max-time 15 "http://$OCI_IP:3200/members"
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'cd ~/lolpamin && docker compose -f docker-compose.prod.yml ps'
```

Expected: `200`, 세 서비스 모두 `running`. `restart: unless-stopped`가 실제로 동작하는지 확인하는 단계다. **다른 프로젝트도 같은 서버에서 돌고 있으므로, 재부팅은 사용자에게 미리 알리고 동의를 받은 뒤에 한다.**

- [ ] **Step 5: 데이터가 재부팅을 견뎠는지 확인**

```bash
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" \
  'cd ~/lolpamin && docker compose -f docker-compose.prod.yml exec -T postgres psql -U lolpamin -d lolpamin -c '"'"'SELECT count(*) FROM "Member";'"'"''
```

Expected: Task 6과 같은 숫자. 볼륨이 제대로 붙어 있다는 확인이다.

- [ ] **Step 6: 배포 절차 문서화 커밋**

이후 재배포는 다음 세 줄이다. `docs/superpowers/reports/`에 배포 완료 보고서를 쓸 때 이 절차를 함께 남긴다:

```bash
git archive HEAD | ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'tar x -C ~/lolpamin'
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'cd ~/lolpamin && docker compose -f docker-compose.prod.yml build'
ssh -i "$OCI_KEY" -p "$OCI_PORT" "$OCI_USER@$OCI_IP" 'cd ~/lolpamin && docker compose -f docker-compose.prod.yml up -d'
```
