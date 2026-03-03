import { beforeEach, describe, expect, test, vi } from "vitest";
import { clearDatabase, testPrisma } from "./helpers/db";

const { requireAdminOrManagerMock } = vi.hoisted(() => ({
  requireAdminOrManagerMock: vi.fn(async () => ({
    id: "admin-phase6",
    role: "CTPA_ADMIN" as const
  }))
}));

vi.mock("@/lib/auth/guard", () => ({
  requireAdminOrManager: requireAdminOrManagerMock
}));

async function seedEmployer(input: { legalName: string; email: string }) {
  return testPrisma.employer.create({
    data: {
      legalName: input.legalName,
      address: "100 Pagination Rd",
      phone: "3135553000",
      email: input.email,
      status: "ACTIVE"
    }
  });
}

describe("Phase 6 admin pagination endpoints", () => {
  beforeEach(async () => {
    await clearDatabase();
    requireAdminOrManagerMock.mockClear();
  });

  test("GET /api/admin/employers returns { items, nextCursor }", async () => {
    await Promise.all([
      seedEmployer({ legalName: "Paginated Employer A", email: "pag-a@example.com" }),
      seedEmployer({ legalName: "Paginated Employer B", email: "pag-b@example.com" }),
      seedEmployer({ legalName: "Paginated Employer C", email: "pag-c@example.com" })
    ]);

    const { GET } = await import("@/app/api/admin/employers/route");
    const response = await GET(new Request("http://localhost/api/admin/employers?limit=2"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.items)).toBe(true);
    expect(payload.items).toHaveLength(2);
    expect(typeof payload.nextCursor).toBe("string");
  });

  test("GET /api/admin/test-requests and /api/admin/results support cursor pagination", async () => {
    const employer = await seedEmployer({
      legalName: "Paginated Requests Employer",
      email: "pag-req@example.com"
    });

    await Promise.all([
      testPrisma.testRequest.create({
        data: {
          employerId: employer.id,
          reason: "USER_REQUEST",
          testType: "DRUG",
          status: "REQUESTED",
          paid: true,
          priceCents: 7500
        }
      }),
      testPrisma.testRequest.create({
        data: {
          employerId: employer.id,
          reason: "USER_REQUEST",
          testType: "ALCOHOL",
          status: "REQUESTED",
          paid: true,
          priceCents: 5000
        }
      }),
      testPrisma.testRequest.create({
        data: {
          employerId: employer.id,
          reason: "USER_REQUEST",
          testType: "BOTH",
          status: "COMPLETED",
          paid: true,
          priceCents: 12500,
          resultStatus: "NEGATIVE",
          resultDate: new Date("2026-01-15"),
          resultReportedAt: new Date("2026-01-16")
        }
      }),
      testPrisma.testRequest.create({
        data: {
          employerId: employer.id,
          reason: "USER_REQUEST",
          testType: "DRUG",
          status: "COMPLETED",
          paid: true,
          priceCents: 7500,
          resultStatus: "POSITIVE",
          resultDate: new Date("2026-01-17"),
          resultReportedAt: new Date("2026-01-18")
        }
      }),
      testPrisma.testRequest.create({
        data: {
          employerId: employer.id,
          reason: "USER_REQUEST",
          testType: "ALCOHOL",
          status: "COMPLETED",
          paid: true,
          priceCents: 5000,
          resultStatus: "NEGATIVE",
          resultDate: new Date("2026-01-19"),
          resultReportedAt: new Date("2026-01-20")
        }
      })
    ]);

    const { GET: getRequests } = await import("@/app/api/admin/test-requests/route");
    const requestsResponse = await getRequests(new Request("http://localhost/api/admin/test-requests?limit=2"));
    expect(requestsResponse.status).toBe(200);
    const requestsPayload = await requestsResponse.json();
    expect(requestsPayload.items).toHaveLength(2);
    expect(typeof requestsPayload.nextCursor).toBe("string");

    const { GET: getResults } = await import("@/app/api/admin/results/route");
    const resultsResponse = await getResults(new Request("http://localhost/api/admin/results?limit=2"));
    expect(resultsResponse.status).toBe(200);
    const resultsPayload = await resultsResponse.json();
    expect(resultsPayload.items).toHaveLength(2);
    expect(typeof resultsPayload.nextCursor).toBe("string");
  });

  test("GET /api/admin/chat/list supports cursor pagination with nextCursor", async () => {
    const [employerA, employerB] = await Promise.all([
      seedEmployer({ legalName: "Chat List A", email: "chat-list-a@example.com" }),
      seedEmployer({ legalName: "Chat List B", email: "chat-list-b@example.com" })
    ]);
    const [userA, userB] = await Promise.all([
      testPrisma.employerUser.create({
        data: {
          email: "chat-list-user-a@example.com",
          fullName: "User A",
          role: "EMPLOYER_DER",
          employerId: employerA.id,
          emailVerifiedAt: new Date(),
          passwordSet: true
        }
      }),
      testPrisma.employerUser.create({
        data: {
          email: "chat-list-user-b@example.com",
          fullName: "User B",
          role: "EMPLOYER_DER",
          employerId: employerB.id,
          emailVerifiedAt: new Date(),
          passwordSet: true
        }
      })
    ]);

    const [c1, c2, c3] = await Promise.all([
      testPrisma.chatConversation.create({
        data: {
          source: "MEMBER",
          status: "OPEN",
          userId: userA.id,
          employerId: employerA.id,
          lastMessageText: "One",
          lastMessageAt: new Date("2026-01-01T09:00:00.000Z")
        }
      }),
      testPrisma.chatConversation.create({
        data: {
          source: "MEMBER",
          status: "OPEN",
          userId: userB.id,
          employerId: employerB.id,
          lastMessageText: "Two",
          lastMessageAt: new Date("2026-01-01T10:00:00.000Z")
        }
      }),
      testPrisma.chatConversation.create({
        data: {
          source: "GUEST",
          status: "OPEN",
          guestName: "Guest Three",
          guestSessionTokenHash: "hash-three",
          lastMessageText: "Three",
          lastMessageAt: new Date("2026-01-01T11:00:00.000Z")
        }
      })
    ]);

    await Promise.all([
      testPrisma.chatMessage.create({
        data: {
          conversationId: c1.id,
          senderType: "MEMBER",
          senderUserId: userA.id,
          messageText: "msg1"
        }
      }),
      testPrisma.chatMessage.create({
        data: {
          conversationId: c2.id,
          senderType: "MEMBER",
          senderUserId: userB.id,
          messageText: "msg2"
        }
      }),
      testPrisma.chatMessage.create({
        data: {
          conversationId: c3.id,
          senderType: "GUEST",
          messageText: "msg3"
        }
      })
    ]);

    const { GET } = await import("@/app/api/admin/chat/list/route");
    const response = await GET(new Request("http://localhost/api/admin/chat/list?limit=2"));
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.items).toHaveLength(2);
    expect(typeof payload.nextCursor).toBe("string");
  });
});
