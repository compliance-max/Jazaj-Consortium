-- CreateEnum
CREATE TYPE "PoolType" AS ENUM ('MASTER', 'INDIVIDUAL');

-- CreateEnum
CREATE TYPE "DotAgency" AS ENUM ('FMCSA');

-- CreateEnum
CREATE TYPE "PoolCadence" AS ENUM ('QUARTERLY');

-- AlterTable
ALTER TABLE "Driver" ADD COLUMN     "currentPoolId" TEXT;

-- AlterTable
ALTER TABLE "Employer" ADD COLUMN     "activePoolId" TEXT,
ADD COLUMN     "poolMode" "PoolType" NOT NULL DEFAULT 'INDIVIDUAL',
ALTER COLUMN "address" DROP DEFAULT,
ALTER COLUMN "phone" DROP DEFAULT,
ALTER COLUMN "email" DROP DEFAULT;

-- CreateTable
CREATE TABLE "Pool" (
    "id" TEXT NOT NULL,
    "type" "PoolType" NOT NULL,
    "employerId" TEXT,
    "dotAgency" "DotAgency" NOT NULL DEFAULT 'FMCSA',
    "cadence" "PoolCadence" NOT NULL DEFAULT 'QUARTERLY',
    "timezone" TEXT NOT NULL DEFAULT 'America/Detroit',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverPoolMembership" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "effectiveStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveEnd" TIMESTAMP(3),
    "changedByUserId" TEXT,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverPoolMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "employerId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pool_type_dotAgency_idx" ON "Pool"("type", "dotAgency");

-- CreateIndex
CREATE INDEX "Pool_employerId_type_idx" ON "Pool"("employerId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Pool_employerId_type_key" ON "Pool"("employerId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Pool_one_master_per_agency" ON "Pool"("dotAgency") WHERE "type" = 'MASTER';

-- CreateIndex
CREATE INDEX "DriverPoolMembership_driverId_effectiveEnd_idx" ON "DriverPoolMembership"("driverId", "effectiveEnd");

-- CreateIndex
CREATE INDEX "DriverPoolMembership_poolId_effectiveStart_idx" ON "DriverPoolMembership"("poolId", "effectiveStart");

-- CreateIndex
CREATE UNIQUE INDEX "DriverPoolMembership_one_active_per_driver" ON "DriverPoolMembership"("driverId") WHERE "effectiveEnd" IS NULL;

-- CreateIndex
CREATE INDEX "AuditLog_employerId_createdAt_idx" ON "AuditLog"("employerId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "Driver_currentPoolId_idx" ON "Driver"("currentPoolId");

-- AddForeignKey
ALTER TABLE "Employer" ADD CONSTRAINT "Employer_activePoolId_fkey" FOREIGN KEY ("activePoolId") REFERENCES "Pool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_currentPoolId_fkey" FOREIGN KEY ("currentPoolId") REFERENCES "Pool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPoolMembership" ADD CONSTRAINT "DriverPoolMembership_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPoolMembership" ADD CONSTRAINT "DriverPoolMembership_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPoolMembership" ADD CONSTRAINT "DriverPoolMembership_changedByUserId_fkey" FOREIGN KEY ("changedByUserId") REFERENCES "EmployerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "EmployerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
