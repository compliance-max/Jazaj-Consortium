-- Phase 9: Admin user management lifecycle fields + role/employer invariants
ALTER TABLE "EmployerUser"
  ADD COLUMN IF NOT EXISTS "disabledAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "invitedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "passwordSetAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "EmployerUser_employerId_role_idx"
  ON "EmployerUser"("employerId", "role");

CREATE INDEX IF NOT EXISTS "EmployerUser_createdAt_id_idx"
  ON "EmployerUser"("createdAt", "id");

ALTER TABLE "EmployerUser"
  DROP CONSTRAINT IF EXISTS "EmployerUser_role_employer_check";

ALTER TABLE "EmployerUser"
  ADD CONSTRAINT "EmployerUser_role_employer_check"
  CHECK (
    (
      "role" IN ('EMPLOYER_DER', 'READONLY_AUDITOR')
      AND "employerId" IS NOT NULL
    )
    OR (
      "role" IN ('CTPA_ADMIN', 'CTPA_MANAGER')
      AND "employerId" IS NULL
    )
  );
