# Consortium Manager - Phase 7

Production-style SaaS for FMCSA consortium management:
- Auth + RBAC + tenant isolation
- Employer management + pool architecture + random engine
- Billing flows (enrollment, renewal, per-test)
- Stripe webhooks as source of truth
- Postmark email notifications
- Result capture + document storage (S3/MinIO or local fallback)
- Enrollment certificate PDF + public verification
- Support chat (guest + member) with admin realtime console
- Security hardening (Origin/Referer checks + CSRF + CORS allowlist + internal job scopes)
- Admin cursor pagination across employers/test requests/results/chat
- Audit export ZIP bundles with index PDF
- Portal/Admin KPI dashboards and UX completion
- Health and retention-candidate operations hooks

## Stack
- Next.js 14 App Router + TypeScript
- Prisma + PostgreSQL
- Redis + BullMQ worker
- Auth.js credentials
- Stripe Checkout + webhook
- Postmark transactional email
- S3-compatible storage (MinIO in dev)
- Vitest tests

## Local setup
1. `cp .env.example .env`
2. `docker compose up -d`
3. `npm i`
4. `npx prisma migrate deploy`
5. `npm run seed:demo`
6. `npm run dev`
7. Optional jobs worker: `npm run worker`
8. Optional guided demo UI: set `DEMO_MODE=true` in `.env` and restart app

## Database workflow (migration-first)
- Reset local DB (drop + recreate + migrate deploy + demo seed):
  - `npm run db:reset`
- Migration health check:
  - `npm run db:check`
- Do not use `prisma db push` in normal development workflow.
- `db:reset` and `ci:migrate:test` target the Docker Postgres container (`<project>-postgres-1` by default). Override with `POSTGRES_CONTAINER` if needed.

## UI demo seed
Run:
- `npm run seed:demo`

Demo logins (local):
- Admin: `admin@example.com` / `Password123!`
- Employer DER: `der@example.com` / `Password123!`

The demo seed creates:
- 1 admin user
- 1 employer + DER account
- 10 drivers
- random event + selected drivers + test requests
- enrollment certificate metadata/document row
- chat conversation sample

## Required env vars
### Core
- `APP_URL`
- `NEXTAUTH_URL`
- `ALLOWED_ORIGINS` (comma-separated full origins, optional; supports root + www)
- `NEXTAUTH_SECRET`
- `DATABASE_URL`
- `TEST_DATABASE_URL`
- `PROMO_JAZAJ_ENABLED` (set `true` to allow promo bypass)
- `PROMO_JAZAJ_CODE` (default `jazaj`)
- `BOOTSTRAP_ADMIN_ENABLED` (default `false`)
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_FORCE_RESET` (default `true`)

### Redis/BullMQ
- `REDIS_URL` (or `REDIS_HOST`/`REDIS_PORT`)
- `INTERNAL_JOB_TOKEN`

### Stripe
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

### Postmark
- `POSTMARK_SERVER_TOKEN`
- `EMAIL_FROM`
- `SUPPORT_EMAIL`
- `SUPPORT_PHONE` (optional)
- `SUPPORT_ADDRESS` (optional)
- `ALLOW_EMAIL_CONSOLE_FALLBACK`
- `POSTMARK_MESSAGE_STREAM_TRANSACTIONAL` (default `transactional`)
- `POSTMARK_MESSAGE_STREAM_NOTIFICATIONS` (default `outbound`)
- `POSTMARK_TEMPLATE_VERIFY_EMAIL_ALIAS`
- `POSTMARK_TEMPLATE_SET_PASSWORD_ALIAS`
- `POSTMARK_TEMPLATE_RESET_PASSWORD_ALIAS`
- `POSTMARK_TEMPLATE_ENROLLMENT_RECEIPT_ALIAS`
- `POSTMARK_TEMPLATE_TEST_REQUEST_RECEIPT_ALIAS`
- `POSTMARK_TEMPLATE_RENEWAL_RECEIPT_ALIAS`
- `POSTMARK_TEMPLATE_RANDOM_SELECTED_NOTICE_ALIAS`
- `POSTMARK_TEMPLATE_RANDOM_NOT_SELECTED_NOTICE_ALIAS`
- `POSTMARK_TEMPLATE_QUARTER_END_ROSTER_REVIEW_ALIAS`
- `POSTMARK_TEMPLATE_CLINIC_ASSIGNED_NOTICE_ALIAS`
- `POSTMARK_TEMPLATE_RESULT_POSTED_NOTICE_ALIAS`
- `POSTMARK_TEMPLATE_CERTIFICATE_ISSUED_ALIAS`

Create a single shared Postmark Layout and assign each template alias above to that layout. The app now sends all outbound mail through `TemplateAlias + TemplateModel` via Postmark's `/email/withTemplate` API.

### Random proof
- `RANDOM_PROOF_SECRET`

### S3 / MinIO
- `S3_REGION`
- `S3_BUCKET`
- `S3_ACCESS_KEY`
- `S3_SECRET_KEY`
- `S3_ENDPOINT` (MinIO: `http://localhost:9000`)
- `S3_FORCE_PATH_STYLE=true` (MinIO)
- `AUDIT_EXPORT_PREFIX` (default `audit-exports`)

### Pusher (realtime chat)
- `PUSHER_APP_ID`
- `PUSHER_KEY`
- `PUSHER_SECRET`
- `PUSHER_CLUSTER`
- `NEXT_PUBLIC_PUSHER_KEY`
- `NEXT_PUBLIC_PUSHER_CLUSTER`

### Optional ops env
- `GIT_SHA` (health endpoint metadata)

## Stripe webhook (local dev)
1. Start app: `npm run dev`
2. Start Stripe listener:
   - `stripe listen --forward-to http://localhost:3000/api/stripe/webhook`
3. Copy webhook signing secret into `.env` as `STRIPE_WEBHOOK_SECRET`
4. Trigger test event:
   - `stripe trigger checkout.session.completed`

## Key pages
- Public enrollment: `/enroll`
- Login: `/login`
- Employer portal:
  - `/portal/dashboard`
  - `/portal/company`
  - `/portal/drivers`
  - `/portal/test-requests`
  - `/portal/results`
  - `/portal/random`
- Admin:
  - `/admin`
  - `/admin/employers`
  - `/admin/test-requests`
  - `/admin/results`
  - `/admin/chat`
  - `/admin/reports`
- Certificate verification:
  - `/verify/certificate/:certificateId`

## Key APIs (Phase 6)
- Enrollment:
  - `POST /api/enroll`
- Stripe:
  - `POST /api/stripe/webhook`
  - `POST /api/stripe/confirm-session`
- Portal:
  - `GET/POST /api/portal/test-requests`
  - `POST /api/portal/test-requests/:id/checkout`
  - `GET /api/portal/results`
  - `GET /api/portal/test-requests/:id/documents`
  - `POST /api/portal/company/renew`
- Admin:
  - `GET /api/admin/dashboard`
  - `GET/POST /api/admin/test-requests`
  - `POST /api/admin/test-requests/:id/assign-clinic`
  - `POST /api/admin/test-requests/:id/results`
  - `GET /api/admin/results`
  - `GET /api/admin/chat/list`
  - `GET /api/admin/chat/conversation/:id`
  - `POST /api/admin/chat/close`
  - `POST /api/admin/reports/export`
  - `GET /api/admin/reports/history`
  - `GET/POST /api/admin/clinics`
  - `POST /api/admin/certificates/regenerate`
  - `POST /api/admin/certificates/void`
- Chat:
  - `POST /api/chat/start`
  - `GET /api/chat/conversation`
  - `GET /api/chat/messages`
  - `POST /api/chat/message`
- Health:
  - `GET /api/health`
- Retention (internal jobs):
  - `POST /api/internal/jobs/retention-candidates`
- Documents:
  - `GET /api/documents/:id/download`
  - `GET /api/documents/raw` (dev-only local fallback; 404 in production)
- Certificate verification:
  - `GET /api/public/certificates/:certificateId`

## Tests
Run:
- `npm test`

CI-style migration validation:
- `npm run ci:migrate:test`
- This command creates a temporary database, runs `prisma migrate deploy`, runs `prisma generate`, then runs the full test suite against that temporary database.

Includes:
- Phase 1 auth + token lifecycle + rate limiting
- Phase 2 tenant isolation
- Phase 3 pool behavior
- Phase 4 random engine/proofs/locking/idempotency
- Phase 5 billing/enrollment/webhook/documents/certificate verification/results sorting

## Build
Run:
- `npm run build`

## Deployment (Render)
- `render.yaml` is included for:
  - web service (`Dockerfile`)
  - worker service (`Dockerfile.worker`)
  - managed Postgres + Redis
- Set required secrets in Render environment variables.
- Web and worker both run `prisma migrate deploy` before startup.
- Bootstrap the first production admin in Render Shell:
  - `BOOTSTRAP_ADMIN_ENABLED=true BOOTSTRAP_ADMIN_EMAIL=you@jazaj.com BOOTSTRAP_ADMIN_PASSWORD='StrongPassHere!' BOOTSTRAP_ADMIN_FORCE_RESET=true npm run bootstrap-admin`

## Production readiness checklist
1. Postmark DNS:
   - Configure SPF, DKIM, and Return-Path for your sending domain.
   - Verify `EMAIL_FROM` sender/domain in Postmark.
2. Stripe:
   - Create production webhook endpoint `/api/stripe/webhook`.
   - Add webhook secret to `STRIPE_WEBHOOK_SECRET`.
   - Keep webhook as the only mutation source for completed payments.
3. S3:
   - Use private bucket policy (no public read).
   - Grant least-privilege IAM for object put/get on app prefix only.
4. Postgres backups:
   - Enable automated daily backups and point-in-time restore.
   - Test restore process at least once before go-live.
5. Log retention:
   - Define retention window for app/platform logs (for example 30-90 days).
   - Preserve audit logs according to compliance policy.
6. Secrets rotation:
   - Rotate `NEXTAUTH_SECRET`, `INTERNAL_JOB_TOKEN`, `RANDOM_PROOF_SECRET`, API keys on a schedule.
7. Admin bootstrap procedure:
   - Set `BOOTSTRAP_ADMIN_ENABLED=true` plus bootstrap email/password env vars.
   - Run `npm run bootstrap-admin` (or let container startup run it automatically).
   - Disable or remove bootstrap credentials after first login.
