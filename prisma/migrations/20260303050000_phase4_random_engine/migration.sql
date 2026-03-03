-- CreateEnum
CREATE TYPE "RandomPeriodType" AS ENUM ('QUARTER');

-- CreateEnum
CREATE TYPE "TestType" AS ENUM ('DRUG', 'ALCOHOL', 'BOTH');

-- CreateEnum
CREATE TYPE "TestReason" AS ENUM ('RANDOM');

-- CreateEnum
CREATE TYPE "TestRequestStatus" AS ENUM ('REQUESTED', 'NOTIFIED', 'SCHEDULED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RandomSelectedStatus" AS ENUM ('SELECTED', 'NOTIFIED', 'SCHEDULED', 'COMPLETED', 'CANCELLED', 'REPLACED');

-- CreateTable
CREATE TABLE "RandomPeriod" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "periodType" "RandomPeriodType" NOT NULL DEFAULT 'QUARTER',
    "periodNumber" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RandomPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PoolSnapshot" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "randomPeriodId" TEXT NOT NULL,
    "employerId" TEXT,
    "coveredDriverCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PoolSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RandomSelectionEvent" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "randomPeriodId" TEXT NOT NULL,
    "employerId" TEXT,
    "eligibleCount" INTEGER NOT NULL,
    "selectedCountDrug" INTEGER NOT NULL,
    "selectedCountAlcohol" INTEGER NOT NULL,
    "eligibleHash" TEXT NOT NULL,
    "selectedHashDrug" TEXT NOT NULL,
    "selectedHashAlcohol" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "randomHmac" TEXT NOT NULL,
    "selectionLocked" BOOLEAN NOT NULL DEFAULT true,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RandomSelectionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RandomEligibleDriver" (
    "id" TEXT NOT NULL,
    "selectionEventId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,

    CONSTRAINT "RandomEligibleDriver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RandomSelectedDriver" (
    "id" TEXT NOT NULL,
    "selectionEventId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "testType" "TestType" NOT NULL,
    "status" "RandomSelectedStatus" NOT NULL DEFAULT 'SELECTED',
    "testRequestId" TEXT,
    "alternateOfSelectedId" TEXT,
    "overrideReason" TEXT,
    "overriddenByUserId" TEXT,

    CONSTRAINT "RandomSelectedDriver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestRequest" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "reason" "TestReason" NOT NULL,
    "testType" "TestType" NOT NULL,
    "status" "TestRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "collectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceYearSummary" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "employerId" TEXT,
    "year" INTEGER NOT NULL,
    "avgCoveredDrivers" DOUBLE PRECISION NOT NULL,
    "requiredDrug" INTEGER NOT NULL,
    "completedDrug" INTEGER NOT NULL,
    "requiredAlcohol" INTEGER NOT NULL,
    "completedAlcohol" INTEGER NOT NULL,
    "lastRecalcAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceYearSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DotRateConfig" (
    "id" TEXT NOT NULL,
    "agency" "DotAgency" NOT NULL,
    "year" INTEGER NOT NULL,
    "drugRate" DOUBLE PRECISION NOT NULL,
    "alcoholRate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DotRateConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RandomPeriod_year_periodNumber_idx" ON "RandomPeriod"("year", "periodNumber");

-- CreateIndex
CREATE UNIQUE INDEX "RandomPeriod_year_periodType_periodNumber_key" ON "RandomPeriod"("year", "periodType", "periodNumber");

-- CreateIndex
CREATE INDEX "PoolSnapshot_poolId_randomPeriodId_idx" ON "PoolSnapshot"("poolId", "randomPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "PoolSnapshot_poolId_randomPeriodId_employerId_key" ON "PoolSnapshot"("poolId", "randomPeriodId", "employerId");

-- CreateIndex
CREATE UNIQUE INDEX "PoolSnapshot_master_unique" ON "PoolSnapshot"("poolId", "randomPeriodId") WHERE "employerId" IS NULL;

-- CreateIndex
CREATE INDEX "RandomSelectionEvent_employerId_runAt_idx" ON "RandomSelectionEvent"("employerId", "runAt");

-- CreateIndex
CREATE UNIQUE INDEX "RandomSelectionEvent_poolId_randomPeriodId_key" ON "RandomSelectionEvent"("poolId", "randomPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "RandomEligibleDriver_selectionEventId_driverId_key" ON "RandomEligibleDriver"("selectionEventId", "driverId");

-- CreateIndex
CREATE UNIQUE INDEX "RandomSelectedDriver_testRequestId_key" ON "RandomSelectedDriver"("testRequestId");

-- CreateIndex
CREATE INDEX "RandomSelectedDriver_employerId_status_idx" ON "RandomSelectedDriver"("employerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RandomSelectedDriver_selectionEventId_driverId_key" ON "RandomSelectedDriver"("selectionEventId", "driverId");

-- CreateIndex
CREATE INDEX "TestRequest_employerId_reason_collectedAt_idx" ON "TestRequest"("employerId", "reason", "collectedAt");

-- CreateIndex
CREATE INDEX "TestRequest_driverId_createdAt_idx" ON "TestRequest"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "ComplianceYearSummary_year_employerId_idx" ON "ComplianceYearSummary"("year", "employerId");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceYearSummary_poolId_employerId_year_key" ON "ComplianceYearSummary"("poolId", "employerId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceYearSummary_master_unique" ON "ComplianceYearSummary"("poolId", "year") WHERE "employerId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "DotRateConfig_agency_year_key" ON "DotRateConfig"("agency", "year");

-- AddForeignKey
ALTER TABLE "PoolSnapshot" ADD CONSTRAINT "PoolSnapshot_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolSnapshot" ADD CONSTRAINT "PoolSnapshot_randomPeriodId_fkey" FOREIGN KEY ("randomPeriodId") REFERENCES "RandomPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PoolSnapshot" ADD CONSTRAINT "PoolSnapshot_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomSelectionEvent" ADD CONSTRAINT "RandomSelectionEvent_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomSelectionEvent" ADD CONSTRAINT "RandomSelectionEvent_randomPeriodId_fkey" FOREIGN KEY ("randomPeriodId") REFERENCES "RandomPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomSelectionEvent" ADD CONSTRAINT "RandomSelectionEvent_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomEligibleDriver" ADD CONSTRAINT "RandomEligibleDriver_selectionEventId_fkey" FOREIGN KEY ("selectionEventId") REFERENCES "RandomSelectionEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomEligibleDriver" ADD CONSTRAINT "RandomEligibleDriver_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomSelectedDriver" ADD CONSTRAINT "RandomSelectedDriver_selectionEventId_fkey" FOREIGN KEY ("selectionEventId") REFERENCES "RandomSelectionEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomSelectedDriver" ADD CONSTRAINT "RandomSelectedDriver_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomSelectedDriver" ADD CONSTRAINT "RandomSelectedDriver_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomSelectedDriver" ADD CONSTRAINT "RandomSelectedDriver_testRequestId_fkey" FOREIGN KEY ("testRequestId") REFERENCES "TestRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomSelectedDriver" ADD CONSTRAINT "RandomSelectedDriver_alternateOfSelectedId_fkey" FOREIGN KEY ("alternateOfSelectedId") REFERENCES "RandomSelectedDriver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RandomSelectedDriver" ADD CONSTRAINT "RandomSelectedDriver_overriddenByUserId_fkey" FOREIGN KEY ("overriddenByUserId") REFERENCES "EmployerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRequest" ADD CONSTRAINT "TestRequest_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRequest" ADD CONSTRAINT "TestRequest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRequest" ADD CONSTRAINT "TestRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "EmployerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceYearSummary" ADD CONSTRAINT "ComplianceYearSummary_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceYearSummary" ADD CONSTRAINT "ComplianceYearSummary_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
