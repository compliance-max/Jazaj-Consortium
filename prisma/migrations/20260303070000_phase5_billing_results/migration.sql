-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('ENROLLMENT', 'RENEWAL', 'TEST_REQUEST');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "EnrollmentSubmissionStatus" AS ENUM ('PENDING', 'PAID', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "TestResultStatus" AS ENUM ('PENDING', 'NEGATIVE', 'POSITIVE', 'REFUSAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentEntityType" AS ENUM ('TEST_REQUEST', 'CERTIFICATE');

-- CreateEnum
CREATE TYPE "DocumentRetentionCategory" AS ENUM ('RANDOM', 'POST_ACCIDENT', 'REASONABLE_SUSPICION', 'RETURN_TO_DUTY', 'FOLLOW_UP', 'OTHER', 'CERTIFICATE');

-- CreateEnum
CREATE TYPE "EnrollmentCertificateStatus" AS ENUM ('ACTIVE', 'VOID');

-- AlterEnum
ALTER TYPE "TestReason" ADD VALUE 'USER_REQUEST';

-- AlterEnum
BEGIN;
CREATE TYPE "TestRequestStatus_new" AS ENUM ('PENDING_PAYMENT', 'REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED');
ALTER TABLE "TestRequest" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "TestRequest" ALTER COLUMN "status" TYPE "TestRequestStatus_new" USING ("status"::text::"TestRequestStatus_new");
ALTER TYPE "TestRequestStatus" RENAME TO "TestRequestStatus_old";
ALTER TYPE "TestRequestStatus_new" RENAME TO "TestRequestStatus";
DROP TYPE "TestRequestStatus_old";
ALTER TABLE "TestRequest" ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';
COMMIT;

-- DropForeignKey
ALTER TABLE "TestRequest" DROP CONSTRAINT "TestRequest_driverId_fkey";

-- AlterTable
ALTER TABLE "Employer" ADD COLUMN     "renewalDueDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TestRequest" ADD COLUMN     "clinicId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "paid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resultDate" TIMESTAMP(3),
ADD COLUMN     "resultReportedAt" TIMESTAMP(3),
ADD COLUMN     "resultStatus" "TestResultStatus" NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "driverId" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING_PAYMENT';

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "employerId" TEXT,
    "testRequestId" TEXT,
    "enrollmentSubmissionId" TEXT,
    "type" "PaymentType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripeSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentSubmission" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "stripeSessionId" TEXT,
    "status" "EnrollmentSubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "instructions" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "employerId" TEXT,
    "entityType" "DocumentEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "retentionCategory" "DocumentRetentionCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnrollmentCertificate" (
    "id" TEXT NOT NULL,
    "employerId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "status" "EnrollmentCertificateStatus" NOT NULL DEFAULT 'ACTIVE',
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,

    CONSTRAINT "EnrollmentCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutConfirmToken" (
    "id" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckoutConfirmToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeSessionId_key" ON "Payment"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentSubmission_stripeSessionId_key" ON "EnrollmentSubmission"("stripeSessionId");

-- CreateIndex
CREATE INDEX "Document_employerId_entityType_entityId_idx" ON "Document"("employerId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "EnrollmentCertificate_documentId_key" ON "EnrollmentCertificate"("documentId");

-- CreateIndex
CREATE INDEX "EnrollmentCertificate_employerId_status_idx" ON "EnrollmentCertificate"("employerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutConfirmToken_stripeSessionId_key" ON "CheckoutConfirmToken"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutConfirmToken_tokenHash_key" ON "CheckoutConfirmToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TestRequest_employerId_createdAt_idx" ON "TestRequest"("employerId", "createdAt");

-- CreateIndex
CREATE INDEX "TestRequest_resultReportedAt_id_idx" ON "TestRequest"("resultReportedAt", "id");

-- AddForeignKey
ALTER TABLE "TestRequest" ADD CONSTRAINT "TestRequest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestRequest" ADD CONSTRAINT "TestRequest_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_testRequestId_fkey" FOREIGN KEY ("testRequestId") REFERENCES "TestRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_enrollmentSubmissionId_fkey" FOREIGN KEY ("enrollmentSubmissionId") REFERENCES "EnrollmentSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentCertificate" ADD CONSTRAINT "EnrollmentCertificate_employerId_fkey" FOREIGN KEY ("employerId") REFERENCES "Employer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnrollmentCertificate" ADD CONSTRAINT "EnrollmentCertificate_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

