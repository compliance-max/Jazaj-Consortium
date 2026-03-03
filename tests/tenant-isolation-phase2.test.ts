import { beforeEach, describe, expect, test, vi } from "vitest";
import { clearDatabase, testPrisma } from "./helpers/db";

const authMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock
}));

describe("Phase 2 tenant isolation", () => {
  beforeEach(async () => {
    await clearDatabase();
    authMock.mockReset();
  });

  test("Employer A cannot read/update/delete Employer B driver; admin can access both employers", async () => {
    const [employerA, employerB] = await Promise.all([
      testPrisma.employer.create({
        data: {
          legalName: "Employer A",
          dotNumber: "A100",
          address: "100 A St",
          phone: "3135550100",
          email: "ops-a@example.com",
          status: "ACTIVE"
        }
      }),
      testPrisma.employer.create({
        data: {
          legalName: "Employer B",
          dotNumber: "B100",
          address: "200 B St",
          phone: "3135550200",
          email: "ops-b@example.com",
          status: "ACTIVE"
        }
      })
    ]);

    const [aDriver, bDriver] = await Promise.all([
      testPrisma.driver.create({
        data: {
          employerId: employerA.id,
          firstName: "Alice",
          lastName: "Driver",
          dob: new Date("1987-01-01")
        }
      }),
      testPrisma.driver.create({
        data: {
          employerId: employerB.id,
          firstName: "Bob",
          lastName: "Driver",
          dob: new Date("1988-01-01")
        }
      })
    ]);

    const { GET, PUT, DELETE } = await import("@/app/api/portal/drivers/route");
    const adminEmployerDetail = await import("@/app/api/admin/employers/[id]/route");

    authMock.mockResolvedValue({
      user: {
        id: "der-a",
        role: "EMPLOYER_DER",
        employerId: employerA.id,
        emailVerifiedAt: new Date().toISOString()
      }
    });

    const getRes = await GET();
    expect(getRes.status).toBe(200);
    const getPayload = await getRes.json();
    const ids = getPayload.drivers.map((driver: { id: string }) => driver.id);
    expect(ids).toContain(aDriver.id);
    expect(ids).not.toContain(bDriver.id);

    const updateBRes = await PUT(
      new Request("http://localhost/api/portal/drivers", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: bDriver.id,
          firstName: "Bobby",
          lastName: "Driver",
          dob: "1988-01-01",
          cdlNumber: null,
          state: null,
          email: null,
          phone: null,
          dotCovered: true,
          active: true
        })
      })
    );
    expect(updateBRes.status).toBe(404);

    const deleteBRes = await DELETE(
      new Request("http://localhost/api/portal/drivers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: bDriver.id })
      })
    );
    expect(deleteBRes.status).toBe(404);

    const derAdminAccessRes = await adminEmployerDetail.GET(new Request("http://localhost/api/admin/employers"), {
      params: { id: employerB.id }
    });
    expect(derAdminAccessRes.status).toBe(403);

    authMock.mockResolvedValue({
      user: {
        id: "admin-1",
        role: "CTPA_ADMIN",
        employerId: null,
        emailVerifiedAt: new Date().toISOString()
      }
    });

    const adminARes = await adminEmployerDetail.GET(new Request("http://localhost/api/admin/employers"), {
      params: { id: employerA.id }
    });
    const adminBRes = await adminEmployerDetail.GET(new Request("http://localhost/api/admin/employers"), {
      params: { id: employerB.id }
    });

    expect(adminARes.status).toBe(200);
    expect(adminBRes.status).toBe(200);
  });
});
