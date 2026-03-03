import { ChatConversationSource, ChatConversationStatus, ChatSenderType, Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { generateRawToken, hashToken } from "@/lib/security/token";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { triggerRealtimeEvent } from "@/lib/realtime/pusher-server";

type ChatActor =
  | {
      kind: "ADMIN";
      userId: string;
      role: UserRole;
    }
  | {
      kind: "MEMBER";
      userId: string;
      employerId: string;
    }
  | {
      kind: "GUEST";
      guestToken: string;
    };

const ADMIN_CHAT_ROLES = new Set<UserRole>(["CTPA_ADMIN", "CTPA_MANAGER"]);

function previewText(input: string) {
  return input.length > 140 ? `${input.slice(0, 137)}...` : input;
}

export function createGuestChatToken() {
  return generateRawToken();
}

function guestTokenHash(token: string) {
  return hashToken(token);
}

async function conversationByActor(input: {
  actor: ChatActor;
  status?: ChatConversationStatus;
}) {
  if (input.actor.kind === "ADMIN") return null;
  if (input.actor.kind === "MEMBER") {
    return prisma.chatConversation.findFirst({
      where: {
        userId: input.actor.userId,
        status: input.status || "OPEN"
      },
      orderBy: { updatedAt: "desc" }
    });
  }
  return prisma.chatConversation.findFirst({
    where: {
      guestSessionTokenHash: guestTokenHash(input.actor.guestToken),
      status: input.status || "OPEN"
    },
    orderBy: { updatedAt: "desc" }
  });
}

export async function startChatConversation(input: {
  actor: ChatActor;
  asGuest?: boolean;
  guestName?: string | null;
  guestEmail?: string | null;
  mergeGuest?: boolean;
  mergeGuestToken?: string | null;
}) {
  if (input.actor.kind === "MEMBER") {
    if (input.mergeGuest && input.mergeGuestToken) {
      const guest = await conversationByActor({
        actor: {
          kind: "GUEST",
          guestToken: input.mergeGuestToken
        }
      });
      if (guest) {
        const merged = await prisma.chatConversation.update({
          where: { id: guest.id },
          data: {
            source: "MEMBER",
            userId: input.actor.userId,
            employerId: input.actor.employerId,
            guestSessionTokenHash: null,
            guestName: guest.guestName,
            guestEmail: guest.guestEmail
          }
        });
        await prisma.auditLog.create({
          data: {
            userId: input.actor.userId,
            employerId: input.actor.employerId,
            action: "CHAT_CONVERSATION_MERGED",
            entityType: "ChatConversation",
            entityId: merged.id
          }
        });
        return { conversation: merged };
      }
    }

    const existing = await conversationByActor({ actor: input.actor });
    if (existing) return { conversation: existing };

    const created = await prisma.chatConversation.create({
      data: {
        source: "MEMBER",
        status: "OPEN",
        userId: input.actor.userId,
        employerId: input.actor.employerId
      }
    });
    await prisma.auditLog.create({
      data: {
        userId: input.actor.userId,
        employerId: input.actor.employerId,
        action: "CHAT_CONVERSATION_CREATED",
        entityType: "ChatConversation",
        entityId: created.id
      }
    });
    return { conversation: created };
  }

  const token = input.actor.kind === "GUEST" ? input.actor.guestToken : createGuestChatToken();
  const hash = guestTokenHash(token);
  const existing = await prisma.chatConversation.findFirst({
    where: {
      guestSessionTokenHash: hash,
      status: "OPEN"
    },
    orderBy: { updatedAt: "desc" }
  });
  if (existing) {
    return { conversation: existing, guestToken: token };
  }

  const created = await prisma.chatConversation.create({
    data: {
      source: "GUEST",
      status: "OPEN",
      guestSessionTokenHash: hash,
      guestName: input.guestName?.trim() || null,
      guestEmail: input.guestEmail?.trim().toLowerCase() || null
    }
  });

  await prisma.auditLog.create({
    data: {
      action: "CHAT_CONVERSATION_CREATED",
      entityType: "ChatConversation",
      entityId: created.id,
      metadata: {
        source: "GUEST"
      }
    }
  });

  return { conversation: created, guestToken: token };
}

export async function getActiveConversationForActor(actor: ChatActor) {
  if (actor.kind === "ADMIN") return null;
  return conversationByActor({ actor });
}

function assertAdmin(actor: ChatActor) {
  if (actor.kind !== "ADMIN" || !ADMIN_CHAT_ROLES.has(actor.role)) {
    throw new Error("FORBIDDEN");
  }
}

export async function ensureConversationAccess(input: { actor: ChatActor; conversationId: string }) {
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: input.conversationId }
  });
  if (!conversation) throw new Error("NOT_FOUND");

  if (input.actor.kind === "ADMIN") {
    assertAdmin(input.actor);
    return conversation;
  }

  if (input.actor.kind === "MEMBER") {
    if (conversation.userId !== input.actor.userId || conversation.employerId !== input.actor.employerId) {
      throw new Error("FORBIDDEN");
    }
    return conversation;
  }

  if (!conversation.guestSessionTokenHash || conversation.guestSessionTokenHash !== guestTokenHash(input.actor.guestToken)) {
    throw new Error("FORBIDDEN");
  }
  return conversation;
}

export async function listConversationMessages(input: {
  actor: ChatActor;
  conversationId: string;
  markRead?: boolean;
}) {
  const conversation = await ensureConversationAccess({
    actor: input.actor,
    conversationId: input.conversationId
  });

  if (input.markRead) {
    if (input.actor.kind === "ADMIN") {
      await prisma.chatMessage.updateMany({
        where: {
          conversationId: conversation.id,
          senderType: {
            in: ["GUEST", "MEMBER"]
          },
          readByAdminAt: null
        },
        data: {
          readByAdminAt: new Date()
        }
      });
    } else {
      await prisma.chatMessage.updateMany({
        where: {
          conversationId: conversation.id,
          senderType: "ADMIN",
          readByMemberAt: null
        },
        data: {
          readByMemberAt: new Date()
        }
      });
    }
  }

  return prisma.chatMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
}

export async function sendChatMessage(input: {
  actor: ChatActor;
  conversationId: string;
  messageText: string;
  ip?: string;
}) {
  const messageText = input.messageText.trim();
  if (messageText.length < 1 || messageText.length > 2000) {
    throw new Error("INVALID_MESSAGE");
  }

  const conversation = await ensureConversationAccess({
    actor: input.actor,
    conversationId: input.conversationId
  });

  const limiterKey =
    input.actor.kind === "GUEST"
      ? `guest:${guestTokenHash(input.actor.guestToken)}:${input.ip || "unknown"}`
      : `${input.actor.kind.toLowerCase()}:${"userId" in input.actor ? input.actor.userId : "unknown"}:${input.ip || "unknown"}`;
  const limiter = await consumeRateLimit({
    namespace: input.actor.kind === "GUEST" ? "chat_guest_send" : "chat_member_send",
    key: limiterKey,
    limit: input.actor.kind === "GUEST" ? 25 : 60,
    windowMs: 60_000
  });
  if (!limiter.ok) throw new Error("RATE_LIMIT");

  const senderType: ChatSenderType =
    input.actor.kind === "ADMIN" ? "ADMIN" : input.actor.kind === "MEMBER" ? "MEMBER" : "GUEST";
  const senderUserId = input.actor.kind === "GUEST" ? null : input.actor.userId;

  const message = await prisma.chatMessage.create({
    data: {
      conversationId: conversation.id,
      senderType,
      senderUserId,
      messageText
    }
  });

  await prisma.chatConversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: message.createdAt,
      lastMessageText: previewText(messageText)
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: senderUserId || null,
      employerId: conversation.employerId,
      action: "CHAT_MESSAGE_SENT",
      entityType: "ChatMessage",
      entityId: message.id,
      metadata: {
        conversationId: conversation.id,
        senderType
      }
    }
  });

  await triggerRealtimeEvent(`chat:conversation:${conversation.id}`, "message:new", {
    message: {
      id: message.id,
      conversationId: conversation.id,
      senderType: message.senderType,
      senderUserId: message.senderUserId,
      messageText: message.messageText,
      createdAt: message.createdAt.toISOString()
    }
  });

  await triggerRealtimeEvent("chat:admin", "conversation:update", {
    conversationId: conversation.id,
    status: conversation.status,
    source: conversation.source,
    employerId: conversation.employerId,
    lastMessageAt: message.createdAt.toISOString(),
    lastMessageText: previewText(messageText)
  });

  return message;
}

export async function listAdminConversations(input: {
  actor: ChatActor;
  cursor?: string | null;
  limit: number;
  status?: ChatConversationStatus | null;
  source?: ChatConversationSource | null;
}) {
  assertAdmin(input.actor);

  const where: Prisma.ChatConversationWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.source ? { source: input.source } : {})
  };

  const items = await prisma.chatConversation.findMany({
    where,
    include: {
      employer: {
        select: {
          id: true,
          legalName: true
        }
      },
      user: {
        select: {
          id: true,
          email: true,
          fullName: true
        }
      },
      _count: {
        select: {
          messages: true
        }
      }
    },
    orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }],
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    take: input.limit + 1
  });

  const hasMore = items.length > input.limit;
  const sliced = hasMore ? items.slice(0, input.limit) : items;
  const conversationIds = sliced.map((row) => row.id);
  const unreadRows =
    conversationIds.length === 0
      ? []
      : await prisma.chatMessage.groupBy({
          by: ["conversationId"],
          where: {
            conversationId: { in: conversationIds },
            senderType: { in: ["GUEST", "MEMBER"] },
            readByAdminAt: null
          },
          _count: {
            _all: true
          }
        });
  const unreadMap = new Map(unreadRows.map((row) => [row.conversationId, row._count._all]));

  return {
    items: sliced.map((row) => ({
      ...row,
      unreadForAdmin: unreadMap.get(row.id) || 0
    })),
    nextCursor: hasMore ? sliced[sliced.length - 1]?.id || null : null
  };
}

export async function getAdminConversationDetail(input: { actor: ChatActor; conversationId: string }) {
  assertAdmin(input.actor);
  const conversation = await prisma.chatConversation.findUnique({
    where: { id: input.conversationId },
    include: {
      employer: {
        select: { id: true, legalName: true, email: true }
      },
      user: {
        select: { id: true, email: true, fullName: true, role: true }
      }
    }
  });
  if (!conversation) return null;

  await prisma.chatMessage.updateMany({
    where: {
      conversationId: conversation.id,
      senderType: { in: ["GUEST", "MEMBER"] },
      readByAdminAt: null
    },
    data: {
      readByAdminAt: new Date()
    }
  });

  const messages = await prisma.chatMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });

  return { conversation, messages };
}

export async function closeAdminConversation(input: {
  actor: ChatActor;
  conversationId: string;
  status?: ChatConversationStatus;
}) {
  assertAdmin(input.actor);
  const status = input.status || "CLOSED";
  const updated = await prisma.chatConversation.update({
    where: { id: input.conversationId },
    data: { status }
  });

  await prisma.auditLog.create({
    data: {
      userId: input.actor.kind === "ADMIN" ? input.actor.userId : null,
      employerId: updated.employerId,
      action: "CHAT_CONVERSATION_CLOSED",
      entityType: "ChatConversation",
      entityId: updated.id,
      metadata: {
        status
      }
    }
  });

  await triggerRealtimeEvent("chat:admin", "conversation:update", {
    conversationId: updated.id,
    status: updated.status
  });

  return updated;
}
