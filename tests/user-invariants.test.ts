import { beforeEach, describe, expect, test } from "vitest";
import { clearDatabase, testPrisma } from "./helpers/db";
import { validateEmployerUserInvariant } from "@/lib/auth/user-invariants";

describe("EmployerUser role/employer invariants", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test("service-layer invariant validation rejects invalid combinations", () => {
    expect(() =>
      validateEmployerUserInvariant({
        role: "CTPA_ADMIN",
        employerId: "emp-1"
      })
    ).toThrow("GLOBAL_ROLE_MUST_NOT_HAVE_EMPLOYER");

    expect(() =>
      validateEmployerUserInvariant({
        role: "EMPLOYER_DER",
        employerId: null
      })
    ).toThrow("EMPLOYER_SCOPED_ROLE_REQUIRES_EMPLOYER");

    expect(() =>
      validateEmployerUserInvariant({
        role: "READONLY_AUDITOR",
        employerId: null
      })
    ).toThrow("EMPLOYER_SCOPED_ROLE_REQUIRES_EMPLOYER");
  });

  test("db check constraint enforces invariants", async () => {
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Invariant Fleet",
        address: "400 Check St",
        phone: "3135550140",
        email: "fleet-invariant@example.com"
      }
    });

    await expect(
      testPrisma.employerUser.create({
        data: {
          email: "bad-admin@example.com",
          fullName: "Bad Admin",
          role: "CTPA_ADMIN",
          employerId: employer.id
        }
      })
    ).rejects.toBeTruthy();

    await expect(
      testPrisma.employerUser.create({
        data: {
          email: "bad-der@example.com",
          fullName: "Bad Der",
          role: "EMPLOYER_DER",
          employerId: null
        }
      })
    ).rejects.toBeTruthy();

    await expect(
      testPrisma.employerUser.create({
        data: {
          email: "bad-readonly@example.com",
          fullName: "Bad Readonly",
          role: "READONLY_AUDITOR",
          employerId: null
        }
      })
    ).rejects.toBeTruthy();
  });
});
