import { beforeEach, describe, expect, test, vi } from "vitest";
import { hashToken } from "@/lib/security/token";
import { hashPassword } from "@/lib/security/password";
import { clearDatabase, testPrisma } from "./helpers/db";

const authMock = vi.fn();
const sendVerificationEmailMock = vi.fn();
const sendSetPasswordEmailMock = vi.fn();
const sendResetPasswordEmailMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock
}));

vi.mock("@/lib/email/postmark", () => ({
  sendVerificationEmail: sendVerificationEmailMock,
  sendSetPasswordEmail: sendSetPasswordEmailMock,
  sendResetPasswordEmail: sendResetPasswordEmailMock
}));

describe("Phase 9 user management", () => {
  beforeEach(async () => {
    await clearDatabase();
    authMock.mockReset();
    sendVerificationEmailMock.mockReset();
    sendSetPasswordEmailMock.mockReset();
    sendResetPasswordEmailMock.mockReset();

    sendVerificationEmailMock.mockResolvedValue({ messageId: "verify-msg" });
    sendSetPasswordEmailMock.mockResolvedValue({ messageId: "set-msg" });
    sendResetPasswordEmailMock.mockResolvedValue({ messageId: "reset-msg" });
  });

  test("admin can create employer DER + READONLY and they are scoped correctly", async () => {
    const admin = await testPrisma.employerUser.create({
      data: {
        email: "admin-users@test.com",
        fullName: "Admin Users",
        role: "CTPA_ADMIN",
        employerId: null,
        emailVerifiedAt: new Date()
      }
    });

    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Scoped Carrier",
        dotNumber: "DOT9001",
        address: "100 Scope Ave",
        phone: "3135550101",
        email: "ops@scoped.test",
        status: "ACTIVE"
      }
    });

    authMock.mockResolvedValue({ user: { id: admin.id } });

    const usersRoute = await import("@/app/api/admin/employers/[id]/users/route");

    const derRes = await usersRoute.POST(
      new Request("http://localhost/api/admin/employers/id/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "der-user@test.com",
          role: "EMPLOYER_DER"
        })
      }),
      { params: { id: employer.id } }
    );

    const auditorRes = await usersRoute.POST(
      new Request("http://localhost/api/admin/employers/id/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "readonly-user@test.com",
          role: "READONLY_AUDITOR"
        })
      }),
      { params: { id: employer.id } }
    );

    expect(derRes.status).toBe(201);
    expect(auditorRes.status).toBe(201);

    const created = await testPrisma.employerUser.findMany({
      where: {
        email: {
          in: ["der-user@test.com", "readonly-user@test.com"]
        }
      },
      orderBy: { email: "asc" }
    });

    expect(created).toHaveLength(2);
    expect(created[0]?.employerId).toBe(employer.id);
    expect(created[0]?.role).toBe("EMPLOYER_DER");
    expect(created[1]?.employerId).toBe(employer.id);
    expect(created[1]?.role).toBe("READONLY_AUDITOR");
    expect(created.every((row) => row.invitedAt)).toBe(true);

    expect(sendVerificationEmailMock).toHaveBeenCalledTimes(2);
    expect(sendSetPasswordEmailMock).toHaveBeenCalledTimes(2);
  });

  test("manager cannot create admin users and cannot disable users", async () => {
    const manager = await testPrisma.employerUser.create({
      data: {
        email: "manager@test.com",
        fullName: "Manager",
        role: "CTPA_MANAGER",
        employerId: null,
        emailVerifiedAt: new Date()
      }
    });

    const target = await testPrisma.employerUser.create({
      data: {
        email: "target@test.com",
        fullName: "Target User",
        role: "EMPLOYER_DER",
        employerId: (
          await testPrisma.employer.create({
            data: {
              legalName: "Target Employer",
              dotNumber: "DOTMGR1",
              address: "1 Main",
              phone: "3135550202",
              email: "target-employer@test.com",
              status: "ACTIVE"
            }
          })
        ).id
      }
    });

    authMock.mockResolvedValue({ user: { id: manager.id } });

    const usersRoute = await import("@/app/api/admin/users/route");
    const patchRoute = await import("@/app/api/admin/users/[id]/route");

    const createAdminRes = await usersRoute.POST(
      new Request("http://localhost/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "new-admin@test.com",
          role: "CTPA_ADMIN"
        })
      })
    );

    const disableRes = await patchRoute.PATCH(
      new Request("http://localhost/api/admin/users/id", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: true })
      }),
      { params: { id: target.id } }
    );

    expect(createAdminRes.status).toBe(403);
    expect(disableRes.status).toBe(403);

    const unchanged = await testPrisma.employerUser.findUnique({ where: { id: target.id } });
    expect(unchanged?.disabledAt).toBeNull();
  });

  test("disabled users are blocked by server guard", async () => {
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Disabled Carrier",
        dotNumber: "DOTDIS1",
        address: "500 Lockout",
        phone: "3135550303",
        email: "disabled@test.com",
        status: "ACTIVE"
      }
    });

    const disabledUser = await testPrisma.employerUser.create({
      data: {
        email: "disabled-der@test.com",
        fullName: "Disabled DER",
        role: "EMPLOYER_DER",
        employerId: employer.id,
        emailVerifiedAt: new Date(),
        disabledAt: new Date()
      }
    });

    authMock.mockResolvedValue({ user: { id: disabledUser.id } });

    const { requireSessionUser } = await import("@/lib/auth/guard");
    await expect(requireSessionUser()).rejects.toThrow("FORBIDDEN");
  });

  test("READONLY_AUDITOR can read portal data but cannot mutate", async () => {
    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Readonly Carrier",
        dotNumber: "DOTRO1",
        address: "600 Readonly",
        phone: "3135550404",
        email: "readonly@test.com",
        status: "ACTIVE"
      }
    });

    const readonlyUser = await testPrisma.employerUser.create({
      data: {
        email: "readonly-auditor@test.com",
        fullName: "Readonly Auditor",
        role: "READONLY_AUDITOR",
        employerId: employer.id,
        emailVerifiedAt: new Date()
      }
    });

    authMock.mockResolvedValue({ user: { id: readonlyUser.id } });

    const companyRoute = await import("@/app/api/portal/company/route");
    const driversRoute = await import("@/app/api/portal/drivers/route");
    const resultsRoute = await import("@/app/api/portal/results/route");
    const renewRoute = await import("@/app/api/portal/company/renew/route");
    const testRequestsRoute = await import("@/app/api/portal/test-requests/route");
    const checkoutRoute = await import("@/app/api/portal/test-requests/[id]/checkout/route");

    const getCompany = await companyRoute.GET();
    const getDrivers = await driversRoute.GET();
    const getResults = await resultsRoute.GET();

    expect(getCompany.status).toBe(200);
    expect(getDrivers.status).toBe(200);
    expect(getResults.status).toBe(200);

    const putCompany = await companyRoute.PUT(
      new Request("http://localhost/api/portal/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "3135559999" })
      })
    );

    const postDriver = await driversRoute.POST(
      new Request("http://localhost/api/portal/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: "New",
          lastName: "Driver",
          dob: "1990-01-01",
          cdlNumber: "MI123",
          state: "MI",
          email: "driver@test.com",
          phone: "3135551111"
        })
      })
    );

    const renewRes = await renewRoute.POST();

    const createRequest = await testRequestsRoute.POST(
      new Request("http://localhost/api/portal/test-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "USER_REQUEST",
          testType: "DRUG",
          city: "Detroit",
          state: "MI"
        })
      })
    );

    const checkoutRes = await checkoutRoute.POST(new Request("http://localhost/api/portal/test-requests/id/checkout", { method: "POST" }), {
      params: { id: "req_readonly_blocked" }
    });

    expect(putCompany.status).toBe(403);
    expect(postDriver.status).toBe(403);
    expect(renewRes.status).toBe(403);
    expect(createRequest.status).toBe(403);
    expect(checkoutRes.status).toBe(403);
  });

  test("resend invite issues new tokens and tokens remain single-use with expiry enforcement", async () => {
    const admin = await testPrisma.employerUser.create({
      data: {
        email: "invite-admin@test.com",
        fullName: "Invite Admin",
        role: "CTPA_ADMIN",
        employerId: null,
        emailVerifiedAt: new Date()
      }
    });

    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Invite Carrier",
        dotNumber: "DOTINV1",
        address: "777 Invite",
        phone: "3135550505",
        email: "invite-carrier@test.com",
        status: "ACTIVE"
      }
    });

    const user = await testPrisma.employerUser.create({
      data: {
        email: "invite-user@test.com",
        fullName: "Invite User",
        role: "EMPLOYER_DER",
        employerId: employer.id,
        emailVerifiedAt: null,
        passwordSet: false
      }
    });

    authMock.mockResolvedValue({ user: { id: admin.id } });

    const resendRoute = await import("@/app/api/admin/users/[id]/resend-invite/route");
    const setPasswordRoute = await import("@/app/api/auth/set-password/route");

    const firstResend = await resendRoute.POST(new Request("http://localhost/api/admin/users/id/resend-invite", { method: "POST" }), {
      params: { id: user.id }
    });
    expect(firstResend.status).toBe(200);

    const firstSetToken = sendSetPasswordEmailMock.mock.calls[0]?.[0]?.token as string;
    expect(firstSetToken).toBeTruthy();

    const secondResend = await resendRoute.POST(new Request("http://localhost/api/admin/users/id/resend-invite", { method: "POST" }), {
      params: { id: user.id }
    });
    expect(secondResend.status).toBe(200);

    const secondSetToken = sendSetPasswordEmailMock.mock.calls[1]?.[0]?.token as string;
    expect(secondSetToken).toBeTruthy();
    expect(secondSetToken).not.toBe(firstSetToken);

    const useFirst = await setPasswordRoute.POST(
      new Request("http://localhost/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: firstSetToken,
          password: "StrongPass#2026"
        })
      })
    );
    expect(useFirst.status).toBe(200);

    const reuseFirst = await setPasswordRoute.POST(
      new Request("http://localhost/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: firstSetToken,
          password: "StrongPass#2027"
        })
      })
    );
    expect(reuseFirst.status).toBe(404);

    await testPrisma.accountToken.updateMany({
      where: {
        tokenHash: hashToken(secondSetToken),
        type: "SET_PASSWORD"
      },
      data: {
        expiresAt: new Date(Date.now() - 60_000)
      }
    });

    const expiredSecond = await setPasswordRoute.POST(
      new Request("http://localhost/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: secondSetToken,
          password: "StrongPass#2028"
        })
      })
    );
    expect(expiredSecond.status).toBe(410);
  });

  test("force reset sends reset token and does not modify existing password hash", async () => {
    const admin = await testPrisma.employerUser.create({
      data: {
        email: "reset-admin@test.com",
        fullName: "Reset Admin",
        role: "CTPA_ADMIN",
        employerId: null,
        emailVerifiedAt: new Date()
      }
    });

    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Reset Carrier",
        dotNumber: "DOTRST1",
        address: "900 Reset",
        phone: "3135550606",
        email: "reset-carrier@test.com",
        status: "ACTIVE"
      }
    });

    const originalHash = await hashPassword("OriginalPass#2026");

    const user = await testPrisma.employerUser.create({
      data: {
        email: "reset-user@test.com",
        fullName: "Reset User",
        role: "EMPLOYER_DER",
        employerId: employer.id,
        passwordHash: originalHash,
        passwordSet: true,
        emailVerifiedAt: new Date()
      }
    });

    authMock.mockResolvedValue({ user: { id: admin.id } });

    const forceResetRoute = await import("@/app/api/admin/users/[id]/force-reset/route");
    const response = await forceResetRoute.POST(new Request("http://localhost/api/admin/users/id/force-reset", { method: "POST" }), {
      params: { id: user.id }
    });

    expect(response.status).toBe(200);
    expect(sendResetPasswordEmailMock).toHaveBeenCalledTimes(1);
    expect(typeof sendResetPasswordEmailMock.mock.calls[0]?.[0]?.token).toBe("string");

    const refreshed = await testPrisma.employerUser.findUnique({ where: { id: user.id } });
    expect(refreshed?.passwordHash).toBe(originalHash);

    const resetTokens = await testPrisma.accountToken.findMany({
      where: {
        userId: user.id,
        type: "RESET_PASSWORD"
      }
    });
    expect(resetTokens.length).toBe(1);
  });
});
