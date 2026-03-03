import { beforeEach, describe, expect, test, vi } from "vitest";
import { clearDatabase, testPrisma } from "./helpers/db";
import {
  getAdminConversationDetail,
  listAdminConversations,
  listConversationMessages,
  sendChatMessage,
  startChatConversation
} from "@/lib/services/chat";

const { triggerRealtimeEventMock } = vi.hoisted(() => ({
  triggerRealtimeEventMock: vi.fn(async () => undefined)
}));

vi.mock("@/lib/realtime/pusher-server", () => ({
  triggerRealtimeEvent: triggerRealtimeEventMock
}));

async function createEmployerWithDer(input: { legalName: string; email: string; derEmail: string }) {
  const employer = await testPrisma.employer.create({
    data: {
      legalName: input.legalName,
      address: "100 Chat Lane",
      phone: "3135551000",
      email: input.email,
      status: "ACTIVE"
    }
  });
  const user = await testPrisma.employerUser.create({
    data: {
      email: input.derEmail,
      fullName: `${input.legalName} DER`,
      role: "EMPLOYER_DER",
      employerId: employer.id,
      emailVerifiedAt: new Date(),
      passwordSet: true
    }
  });
  return { employer, user };
}

describe("Phase 6 chat ownership and realtime", () => {
  beforeEach(async () => {
    await clearDatabase();
    triggerRealtimeEventMock.mockClear();
  });

  test("guest ownership: guest cannot read or post to another guest conversation", async () => {
    const guestA = await startChatConversation({
      actor: { kind: "GUEST", guestToken: "guest-token-A" },
      asGuest: true,
      guestName: "Guest A"
    });

    await sendChatMessage({
      actor: { kind: "GUEST", guestToken: "guest-token-A" },
      conversationId: guestA.conversation.id,
      messageText: "Hello from guest A",
      ip: "127.0.0.1"
    });

    await expect(
      listConversationMessages({
        actor: { kind: "GUEST", guestToken: "guest-token-B" },
        conversationId: guestA.conversation.id
      })
    ).rejects.toThrow("FORBIDDEN");

    await expect(
      sendChatMessage({
        actor: { kind: "GUEST", guestToken: "guest-token-B" },
        conversationId: guestA.conversation.id,
        messageText: "Unauthorized post",
        ip: "127.0.0.1"
      })
    ).rejects.toThrow("FORBIDDEN");
  });

  test("member ownership: employer user cannot access another employer conversation", async () => {
    const { employer: employerA, user: derA } = await createEmployerWithDer({
      legalName: "Chat Carrier A",
      email: "carrier-a@example.com",
      derEmail: "der-a-chat@example.com"
    });
    const { employer: employerB, user: derB } = await createEmployerWithDer({
      legalName: "Chat Carrier B",
      email: "carrier-b@example.com",
      derEmail: "der-b-chat@example.com"
    });

    const conversationA = await startChatConversation({
      actor: {
        kind: "MEMBER",
        userId: derA.id,
        employerId: employerA.id
      }
    });

    await sendChatMessage({
      actor: {
        kind: "MEMBER",
        userId: derA.id,
        employerId: employerA.id
      },
      conversationId: conversationA.conversation.id,
      messageText: "Employer A message",
      ip: "127.0.0.1"
    });

    await expect(
      listConversationMessages({
        actor: {
          kind: "MEMBER",
          userId: derB.id,
          employerId: employerB.id
        },
        conversationId: conversationA.conversation.id
      })
    ).rejects.toThrow("FORBIDDEN");
  });

  test("admin can view conversations and pagination returns nextCursor", async () => {
    const { employer: employerA, user: derA } = await createEmployerWithDer({
      legalName: "Admin View A",
      email: "admin-view-a@example.com",
      derEmail: "admin-view-der-a@example.com"
    });
    const { employer: employerB, user: derB } = await createEmployerWithDer({
      legalName: "Admin View B",
      email: "admin-view-b@example.com",
      derEmail: "admin-view-der-b@example.com"
    });

    const conversationA = await startChatConversation({
      actor: {
        kind: "MEMBER",
        userId: derA.id,
        employerId: employerA.id
      }
    });
    const conversationB = await startChatConversation({
      actor: {
        kind: "MEMBER",
        userId: derB.id,
        employerId: employerB.id
      }
    });
    const guestConversation = await startChatConversation({
      actor: {
        kind: "GUEST",
        guestToken: "guest-admin-page"
      },
      guestName: "Guest Console"
    });

    await sendChatMessage({
      actor: { kind: "MEMBER", userId: derA.id, employerId: employerA.id },
      conversationId: conversationA.conversation.id,
      messageText: "Message A",
      ip: "127.0.0.1"
    });
    await sendChatMessage({
      actor: { kind: "MEMBER", userId: derB.id, employerId: employerB.id },
      conversationId: conversationB.conversation.id,
      messageText: "Message B",
      ip: "127.0.0.1"
    });
    await sendChatMessage({
      actor: { kind: "GUEST", guestToken: "guest-admin-page" },
      conversationId: guestConversation.conversation.id,
      messageText: "Guest message",
      ip: "127.0.0.1"
    });

    const page1 = await listAdminConversations({
      actor: { kind: "ADMIN", userId: "admin-user", role: "CTPA_ADMIN" },
      limit: 2
    });
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await listAdminConversations({
      actor: { kind: "ADMIN", userId: "admin-user", role: "CTPA_ADMIN" },
      limit: 2,
      cursor: page1.nextCursor
    });
    expect(page2.items.length).toBeGreaterThanOrEqual(1);

    const detail = await getAdminConversationDetail({
      actor: { kind: "ADMIN", userId: "admin-user", role: "CTPA_ADMIN" },
      conversationId: conversationA.conversation.id
    });
    expect(detail?.conversation.id).toBe(conversationA.conversation.id);
    expect(detail?.messages.length).toBeGreaterThan(0);
  });

  test("sending chat messages triggers realtime events", async () => {
    const guest = await startChatConversation({
      actor: { kind: "GUEST", guestToken: "guest-realtime" },
      guestName: "Realtime Guest"
    });

    await sendChatMessage({
      actor: { kind: "GUEST", guestToken: "guest-realtime" },
      conversationId: guest.conversation.id,
      messageText: "Realtime check",
      ip: "127.0.0.1"
    });

    expect(triggerRealtimeEventMock).toHaveBeenCalledTimes(2);
    expect(triggerRealtimeEventMock).toHaveBeenCalledWith(
      `chat:conversation:${guest.conversation.id}`,
      "message:new",
      expect.any(Object)
    );
    expect(triggerRealtimeEventMock).toHaveBeenCalledWith(
      "chat:admin",
      "conversation:update",
      expect.objectContaining({
        conversationId: guest.conversation.id
      })
    );
  });
});
