-- Add promo/payment metadata support for enrollment bypass flow
ALTER TABLE "EnrollmentSubmission"
ADD COLUMN IF NOT EXISTS "paid" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Payment"
ADD COLUMN IF NOT EXISTS "method" TEXT NOT NULL DEFAULT 'STRIPE',
ADD COLUMN IF NOT EXISTS "reference" TEXT;
