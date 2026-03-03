-- CreateEnum
CREATE TYPE "EmployerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "Employer"
ADD COLUMN "dotNumber" TEXT,
ADD COLUMN "address" TEXT NOT NULL DEFAULT '',
ADD COLUMN "phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN "email" TEXT NOT NULL DEFAULT '',
ADD COLUMN "status" "EmployerStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'America/Detroit';

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dob" TIMESTAMP(3) NOT NULL,
    "cdlNumber" TEXT,
    "state" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "dotCovered" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employer_dotNumber_key" ON "Employer"("dotNumber");
CREATE INDEX "Driver_employerId_active_idx" ON "Driver"("employerId", "active");
CREATE INDEX "Driver_employerId_createdAt_idx" ON "Driver"("employerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Driver"
ADD CONSTRAINT "Driver_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add user role/employer invariants
ALTER TABLE "EmployerUser"
ADD CONSTRAINT "EmployerUser_role_employer_check"
CHECK (
  ("role" = 'EMPLOYER_DER' AND "employerId" IS NOT NULL)
  OR ("role" IN ('CTPA_ADMIN', 'CTPA_MANAGER', 'READONLY_AUDITOR') AND "employerId" IS NULL)
);
