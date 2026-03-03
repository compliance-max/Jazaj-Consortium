import { afterAll, beforeAll } from "vitest";
import { testPrisma } from "./helpers/db";

beforeAll(async () => {
  // Prisma schema cannot express this role/employer check, so enforce it for tests explicitly.
  await testPrisma.$executeRawUnsafe(
    'ALTER TABLE "EmployerUser" DROP CONSTRAINT IF EXISTS "EmployerUser_role_employer_check";'
  );
  await testPrisma.$executeRawUnsafe(`
    ALTER TABLE "EmployerUser"
    ADD CONSTRAINT "EmployerUser_role_employer_check"
    CHECK (
      ("role" = 'EMPLOYER_DER' AND "employerId" IS NOT NULL)
      OR ("role" IN ('CTPA_ADMIN', 'CTPA_MANAGER', 'READONLY_AUDITOR') AND "employerId" IS NULL)
    );
  `);
  await testPrisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "DriverPoolMembership_one_active_per_driver"
    ON "DriverPoolMembership"("driverId")
    WHERE "effectiveEnd" IS NULL;
  `);
  await testPrisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Pool_one_master_per_agency"
    ON "Pool"("dotAgency")
    WHERE "type" = 'MASTER';
  `);
  await testPrisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PoolSnapshot_master_unique"
    ON "PoolSnapshot"("poolId","randomPeriodId")
    WHERE "employerId" IS NULL;
  `);
  await testPrisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ComplianceYearSummary_master_unique"
    ON "ComplianceYearSummary"("poolId","year")
    WHERE "employerId" IS NULL;
  `);
});

afterAll(async () => {
  await testPrisma.$disconnect();
});
