# 관리자 인증 및 OCI 배포 설계

**날짜:** 2026-08-30
**상태:** 설계 승인 대기
**관련 문서:** `docs/superpowers/specs/2026-08-23-discord-kakao-integration-design.md` (전체 시스템 설계)

## 배경 및 목적

지금까지 대시보드는 개발자 로컬(`localhost:3000`)에서만 떠 있었다. 이제 OCI(Oracle Cloud Infrastructure) 인스턴스에 상시 배포해, 운영진이 아무 때나 접속하고 디스코드 봇도 24시간 떠 있게 한다.

문제는 대시보드에 인증이 전혀 없다는 것이다. 공개 IP의 포트에 그대로 열면 주소를 아는 누구나 회원을 삭제하고, 게임 결과를 조작하고, 카카오톡 대화에서 수집된 실명·나이 섞인 닉네임을 열람할 수 있다.

따라서 이 작업은 두 덩어리로 구성된다:

1. **관리자 인증** — 조회는 누구나, 변경은 로그인한 관리자만. 관리자는 다른 관리자를 추가할 수 있다.
2. **OCI 배포** — Docker Compose로 대시보드·디스코드 봇·Postgres를 인스턴스에 올리고, 로컬 개발 DB 데이터를 이관한다.

인증을 먼저 완성한 뒤 배포한다. 순서를 뒤집으면 인증이 붙기 전까지 공개된 무방비 구간이 생기고, 배포를 두 번 하게 된다.

## 범위

**포함:**

- `Admin` / `AdminSession` 테이블과 마이그레이션
- 아이디·비밀번호 로그인, 세션 쿠키, 로그아웃
- 모든 변경 서버 액션에 대한 서버사이드 권한 검사
- 관리자 목록·추가·삭제 화면 (`/admins`)
- 최초 관리자 부트스트랩 경로
- 대시보드·디스코드 봇 Dockerfile과 운영용 compose 파일
- 소스 전달, 마이그레이션 적용, 로컬 DB 데이터 이관 절차

**범위 밖:**

- HTTPS/도메인. 현재는 평문 HTTP로 서비스한다 (아래 "알려진 한계" 참조).
- 비밀번호 재설정, 이메일 인증, 2단계 인증, 로그인 시도 제한.
- 역할 구분(관리자/편집자/뷰어 3단계). 관리자는 한 종류뿐이고, 비로그인 사용자가 곧 뷰어다.
- CI/CD. 배포는 사람이 명령어를 실행하는 수동 절차다.
- 로그 수집, 모니터링, 알림, DB 백업 자동화.

## 대상 서버 (확인된 사실)

2026-08-30 SSH 접속으로 확인한 상태다.

- Ubuntu 24.04.4 LTS, **aarch64(ARM64)**, vCPU 1개, RAM 5.9GB, 루트 디스크 여유 167GB
- Docker 29.6.1, Docker Compose v5.3.1 설치됨. **호스트에 Node.js는 없음** → 빌드는 컨테이너 안에서 수행한다.
- 이미 다른 프로젝트들이 돌고 있다: Caddy(80/443), 프론트엔드 2개(3000, 3100), Postgres 3개(내부 포트 또는 루프백). **3200은 비어 있고**, `.env`의 `OCI_INSTANCE_SERVICE_PORT=3200`이 이 용도로 지정돼 있다.
- 접속 정보는 `.env`의 `OCI_INSTANCE_*` 키에 있다 (IP, SSH 포트/사용자, 개인키 경로).

ARM64라는 점이 중요하다. Prisma는 아키텍처별 쿼리 엔진 바이너리를 쓰므로, 이미지 빌드를 **서버에서** 수행해 네이티브 타겟이 잡히게 한다.

## 데이터 모델

기존 스키마에 두 테이블을 추가한다. 기존 테이블은 건드리지 않는다.

```
model Admin {
  id           String   @id @default(uuid())
  username     String   @unique
  passwordHash String                    // scrypt 파라미터·솔트·해시를 한 문자열에 담음
  createdAt    DateTime @default(now())
  createdById  String?                   // 이 관리자를 추가한 관리자. 최초 관리자는 null
  sessions     AdminSession[]
}

model AdminSession {
  id        String   @id @default(uuid())
  tokenHash String   @unique             // 쿠키 원문의 SHA-256
  adminId   String
  admin     Admin    @relation(fields: [adminId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

설계 근거:

- **`createdById`는 FK가 아닌 평문 id 문자열로 둔다.** 추가한 관리자가 나중에 삭제돼도 "누가 추가했는지"라는 감사 정보는 남아야 하는데, FK로 두면 삭제를 막거나 값을 지워야 한다. 화면에서는 그 id로 현재 관리자를 조회해 이름을 찾고, 없으면 "삭제된 관리자"로 표시한다.
- **`AdminSession`은 `onDelete: Cascade`를 명시한다.** 관리자를 삭제하면 그 세션도 즉시 무효화돼야 한다. 이는 기존 `MentionLog`/`GameParticipant`가 cascade 없이 만들어져 회원 삭제 시 자식을 수동으로 지워야 하는 것과 의도적으로 다르다 — 세션은 감사 가치가 없는 파생 데이터다.
- **쿠키에는 랜덤 원문, DB에는 해시만.** DB 덤프가 유출돼도 그것만으로 남의 세션을 위조할 수 없다.

## 컴포넌트

### `apps/dashboard/lib/auth/password.ts` (순수)

- `hashPassword(plain: string): Promise<string>` — 16바이트 랜덤 솔트 + `crypto.scrypt`(N=16384, r=8, p=1, 64바이트). 결과는 `scrypt$16384$8$1$<salt-b64>$<hash-b64>` 형식의 단일 문자열.
- `verifyPassword(plain: string, stored: string): Promise<boolean>` — 저장 문자열에서 파라미터를 파싱해 같은 방식으로 유도한 뒤 `crypto.timingSafeEqual`로 비교. 형식이 깨진 문자열은 예외가 아니라 `false`를 반환한다.

외부 의존성을 쓰지 않는 이유: bcrypt/argon2 계열은 네이티브 애드온이라 ARM64 이미지 빌드에서 컴파일 문제를 만들기 쉽다. `scrypt`는 Node 내장이고 이 규모(관리자 수 명, 로그인 빈도 낮음)에 충분하다.

### `apps/dashboard/lib/auth/session.ts` (DB)

- `createSession(prisma, adminId): Promise<{ token: string; expiresAt: Date }>` — 32바이트 랜덤 토큰 생성, SHA-256만 저장, 유효기간 7일.
- `getAdminBySessionToken(prisma, token): Promise<Admin | null>` — 해시로 조회하고 `expiresAt`이 지났으면 `null`을 반환하며 그 행을 지운다(별도 스케줄러 없음).
- `destroySession(prisma, token): Promise<void>` — 해당 세션 행 삭제. 없는 토큰이어도 조용히 통과한다.

### `apps/dashboard/lib/auth/current-admin.ts` (Next 런타임)

- `getCurrentAdmin(): Promise<Admin | null>` — `cookies()`에서 세션 쿠키를 읽어 위 함수로 확인. 서버 컴포넌트와 서버 액션 양쪽에서 쓴다.
- `requireAdmin(): Promise<Admin>` — 없으면 `Error("관리자 로그인이 필요합니다")`를 던진다.

세션 쿠키: 이름 `lolpamin_session`, `httpOnly`, `sameSite=lax`, `path=/`, 유효기간 7일. `secure`는 환경변수 `COOKIE_SECURE`가 켜졌을 때만 붙인다 — 지금은 평문 HTTP라 꺼두고, HTTPS로 올릴 때 켠다.

### `apps/dashboard/lib/mutations/admins.ts` (DB)

- `createAdmin(prisma, { username, password, createdById })` — 아이디 중복 시 명확한 에러. 비밀번호 최소 8자 검증.
- `deleteAdmin(prisma, targetId, actingAdminId)` — 자기 자신 삭제 불가, 마지막 남은 관리자 삭제 불가. 두 경우 에러 메시지가 이유를 구분해서 말한다.

### 화면

- **헤더(모든 페이지)** — `AppShell` 우상단. 비로그인이면 `로그인` 링크, 로그인 상태면 아이디와 `로그아웃` 버튼. 현재 "Discord Bot · 정상" 상태 줄이 있는 자리를 쓴다.
- **`/login`** — 아이디·비밀번호 폼. 성공하면 쿠키를 굽고 `/members`로 보낸다. 실패는 아이디가 없든 비밀번호가 틀리든 **동일한 문구**("아이디 또는 비밀번호가 올바르지 않습니다")로 응답해 계정 존재 여부를 노출하지 않는다.
- **`/admins`** (관리자 전용) — 목록(아이디 / 추가한 사람 / 생성일), 추가 폼(아이디·비밀번호), 각 행 삭제 버튼. 비로그인으로 접근하면 `/login`으로 리다이렉트한다. 사이드바 nav에 항목을 추가하되 로그인 상태에서만 보인다.
- **기존 페이지** — 비로그인 상태에서는 변경 UI(회원 삭제 버튼, 게임 결과 저장, 계정 연결, 카톡 업로드 폼)를 감춘다. 조회는 그대로 보인다.

## 권한 경계

**UI에서 버튼을 감추는 것은 편의일 뿐, 방어선이 아니다.** Next.js 서버 액션은 클라이언트에서 직접 호출될 수 있으므로, 다음 액션 모두가 첫 줄에서 `await requireAdmin()`을 호출한다:

| 액션 | 파일 |
|---|---|
| `deleteMemberAction` | `app/members/actions.ts` |
| `saveGameResultAction` | `app/matches/actions.ts` |
| `linkMembersAction` | `app/link-accounts/actions.ts` |
| `importKakaoExportAction` | `app/kakao-import/actions.ts` |
| `createAdminAction`, `deleteAdminAction` | `app/admins/actions.ts` (신규) |

`loginAction`만 인증 없이 호출 가능하다. `logoutAction`은 쿠키에 담긴 세션만 지우므로 별도 권한 검사가 필요 없다.

조회 경로(`/`, `/members`, `/matches`, `/inactive`, `/link-accounts`의 목록)는 비로그인도 접근 가능하다. 카카오톡 원문 메시지(`MentionLog.rawMessage`)를 그대로 노출하는 화면은 현재 없으며, 이 설계에서도 만들지 않는다.

## 최초 관리자 부트스트랩

대시보드 프로세스가 시작될 때 `Admin` 테이블이 비어 있고 `ADMIN_BOOTSTRAP_USERNAME`·`ADMIN_BOOTSTRAP_PASSWORD`가 모두 설정돼 있으면, 그 자격증명으로 관리자 한 명을 만들고 로그에 생성 사실을 남긴다. 테이블이 비어 있지 않으면 아무 것도 하지 않는다.

검토한 대안: 별도 CLI 스크립트를 `docker compose exec`로 실행. 더 깔끔하지만 배포 절차에 수동 단계가 늘고 컨테이너 안에서 워크스페이스 경로를 맞춰야 한다. 이 규모에서는 env 부트스트랩이 낫다고 판단했다.

부트스트랩 후에는 서버 `.env`에서 두 변수를 지우도록 배포 절차에 명시한다.

## 배포 아키텍처

```
OCI 인스턴스 (ubuntu, ARM64)
└─ ~/lolpamin/                      ← git archive로 밀어넣은 소스
   ├─ docker-compose.prod.yml
   ├─ .env                          ← scp로 따로 전달 (git에 없음)
   └─ (리포 소스)

컨테이너
├─ lolpamin-postgres   postgres:16-alpine, 호스트 포트 미노출, 볼륨 lolpamin-pgdata
├─ lolpamin-dashboard  0.0.0.0:3200 → 3200
└─ lolpamin-bot        포트 없음
```

- 세 컨테이너 모두 `restart: unless-stopped`. 인스턴스가 재부팅돼도 자동 복구된다.
- Postgres는 호스트에 포트를 노출하지 않는다. 이미 다른 Postgres 3개가 떠 있어 충돌을 피해야 하고, 외부에서 DB에 직접 붙을 경로를 만들지 않는 편이 낫다.
- 대시보드 컨테이너는 시작할 때 `prisma migrate deploy`를 실행한 뒤 `next start -p 3200`으로 넘어간다. 마이그레이션이 실패하면 컨테이너는 기동하지 않는다.
- 디스코드 봇은 대시보드와 별도 이미지를 쓴다. 한쪽이 죽어도 다른 쪽에 영향이 없어야 한다는 전체 설계의 격리 원칙을 따른다.
- 두 이미지 모두 `node:20-bookworm-slim` 기반이며 **서버에서 빌드**한다. ARM64 네이티브 Prisma 엔진이 잡히고, 로컬에서 크로스 빌드하거나 이미지를 전송할 필요가 없다.

### 소스 전달

`git archive HEAD | ssh <instance> 'tar x -C ~/lolpamin'`

- 커밋된 파일만 전달된다. `node_modules`, `.env`, `data/`(실제 카톡 대화)는 자연히 제외된다.
- 서버에 GitHub 자격증명을 두지 않아도 된다.
- 배포된 것이 곧 커밋된 것이므로, 서버에 무엇이 올라갔는지 커밋 해시로 특정할 수 있다.

서버 `.env`는 로컬 `.env`와 값이 다르다: `DATABASE_URL`이 컨테이너 네트워크(`postgres:5432`)를 가리키고, `DATABASE_URL_TEST`와 `OCI_INSTANCE_*`는 필요 없으며, `ADMIN_BOOTSTRAP_*`가 최초 1회 들어간다.

### 데이터 이관

1. 서버에서 컨테이너를 올려 `prisma migrate deploy`로 **스키마를 먼저 만든다**.
2. 로컬에서 `pg_dump --data-only`로 데이터만 덤프한다 (2026-08-30 기준 회원 36명 / 활동기록 428건).
3. 덤프를 서버로 보내 `psql`로 복원한다.
4. 대시보드에서 회원 수와 활동기록 수가 로컬과 일치하는지 확인한다.

스키마 포함 덤프를 쓰지 않는 이유: 마이그레이션이 만든 스키마와 충돌하고 `_prisma_migrations` 테이블 상태가 어긋난다.

### 디스코드 봇 전환

같은 봇 토큰으로 게이트웨이 세션이 둘 붙으면 슬래시 명령에 중복 응답할 수 있다. **서버 봇을 올리기 전에 로컬에서 돌고 있는 봇 프로세스를 종료한다.** 슬래시 명령은 이미 길드에 등록돼 있으므로(2026-08-30 등록 완료) 서버에서 다시 등록할 필요는 없다.

## 에러 처리

- **로그인 실패** — 아이디 없음/비밀번호 불일치를 구분하지 않는 단일 메시지. 응답 시간 차이로 계정 존재를 추측하는 것을 막기 위해, 아이디가 없을 때도 더미 해시로 검증을 수행한다.
- **세션 만료** — 만료된 쿠키로 조회 페이지에 오면 그냥 비로그인으로 보인다. 변경 액션을 호출하면 "관리자 로그인이 필요합니다" 에러가 UI에 표시된다.
- **부트스트랩 충돌** — 두 프로세스가 동시에 최초 관리자를 만들려 하면 `username` unique 제약이 두 번째를 막는다. 이 경우 예외를 로그로 남기고 기동은 계속한다.
- **마이그레이션 실패** — 대시보드 컨테이너가 기동하지 않는다. 봇과 DB는 영향받지 않는다.

## 테스트 전략

- **`password.ts`** — 순수 함수 단위 테스트. 같은 비밀번호가 매번 다른 해시를 내는지, 올바른 비밀번호를 통과시키는지, 틀린 비밀번호와 깨진 저장 문자열을 거부하는지.
- **`session.ts`, `mutations/admins.ts`** — `DATABASE_URL_TEST` 대상 통합 테스트. 세션 생성·조회·만료·삭제, 아이디 중복, 자기 자신 삭제 금지, 마지막 관리자 삭제 금지, 관리자 삭제 시 세션 동반 삭제.
- **권한 검사** — 각 변경 액션이 비로그인 상태에서 거부되는지 확인하는 테스트. **이 작업에서 가장 중요한 테스트다.** UI를 감추는 것만으로는 막히지 않는 경로이기 때문이다.
- **배포** — 자동화 테스트 대상이 아니다. 배포 후 수동 확인 항목을 구현 계획에 체크리스트로 넣는다: 3200 응답, 로그인 성공/실패, 비로그인 시 변경 차단, 회원 수 일치, 디스코드에서 `/랭킹` 응답, 인스턴스 재부팅 후 자동 복구.

## 알려진 한계

- **평문 HTTP.** 로그인 비밀번호와 세션 쿠키가 암호화되지 않은 채 전송된다. 신뢰할 수 없는 네트워크(공용 와이파이 등)에서 로그인하면 가로채질 수 있다. 도메인이 확보되면 서버에 이미 떠 있는 Caddy에 붙여 HTTPS로 올리는 것이 다음 단계이며, 그때 `COOKIE_SECURE`를 켠다.
- **비밀번호 재설정 경로 없음.** 비밀번호를 잊으면 다른 관리자가 계정을 지우고 새로 만들어야 한다. 관리자가 한 명뿐인 상태에서 잊으면 DB에 직접 손대야 한다.
- **로그인 시도 제한 없음.** 무차별 대입에 대한 방어가 `scrypt`의 계산 비용뿐이다. 노출 규모가 작아 감수한다.
- **단일 인스턴스, 백업 없음.** DB 볼륨이 날아가면 카톡 txt 재업로드로 복구 가능한 부분(회원·활동기록)만 되살아나고, 수동 입력분(실명, 계정 연결, 게임 결과, ELO)은 사라진다.
- **비로그인 열람 범위.** 조회 페이지에는 카톡 닉네임이 그대로 보이고, 그 닉네임에는 실명과 나이가 섞여 있는 경우가 많다. "조회는 누구나"는 이 정보가 공개된다는 뜻이다.

## 부수 작업

`ssh-key-2026-07-09.key`(OCI 접속용 개인키)가 리포 루트에 추적되지 않은 채 놓여 있고 `.gitignore`에도 없다. `git add -A` 한 번이면 GitHub에 올라간다. 이 작업에서 `.gitignore`에 `*.key`를 추가한다.
