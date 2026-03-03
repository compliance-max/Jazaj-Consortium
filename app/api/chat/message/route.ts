import { cookies } from "next/headers";
import { z } from "zod";
import { auth } from "@/auth";
import { fail, ok } from "@/lib/http";
import { sendChatMessage } from "@/lib/services/chat";
import { createLogger } from "@/lib/logging/logger";

const GUEST_COOKIE = "cm_guest_chat_token";

const schema = z.object({
  conversationId: z.string().min(1),
  messageText: z.string().min(1).max(2000)
});

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") || crypto.randomUUID();
  const logger = createLogger({ requestId, route: "/api/chat/message", method: "POST" });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const session = await auth();
  try {
    if (session?.user?.id && (session.user.role === "CTPA_ADMIN" || session.user.role === "CTPA_MANAGER")) {
      const message = await sendChatMessage({
        actor: {
          kind: "ADMIN",
          userId: session.user.id,
          role: session.user.role
        },
        conversationId: parsed.data.conversationId,
        messageText: parsed.data.messageText,
        ip
      });
      logger.info("Admin chat message sent", { userId: session.user.id });
      return ok({ message }, 201);
    }

    if (session?.user?.id && session.user.role === "EMPLOYER_DER" && session.user.employerId) {
      const message = await sendChatMessage({
        actor: {
          kind: "MEMBER",
          userId: session.user.id,
          employerId: session.user.employerId
        },
        conversationId: parsed.data.conversationId,
        messageText: parsed.data.messageText,
        ip
      });
      logger.info("Member chat message sent", { userId: session.user.id, employerId: session.user.employerId });
      return ok({ message }, 201);
    }

    const guestToken = cookies().get(GUEST_COOKIE)?.value;
    if (!guestToken) return fail("Unauthorized", 401);
    const message = await sendChatMessage({
      actor: {
        kind: "GUEST",
        guestToken
      },
      conversationId: parsed.data.conversationId,
      messageText: parsed.data.messageText,
      ip
    });
    logger.info("Guest chat message sent");
    return ok({ message }, 201);
  } catch (error) {
    logger.warn("Chat message rejected", {
      error: error instanceof Error ? error.message : "unknown"
    });
    if (error instanceof Error && error.message === "INVALID_MESSAGE") return fail("Invalid message", 422);
    if (error instanceof Error && error.message === "RATE_LIMIT") return fail("Too many messages", 429);
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Not found", 404);
    if (error instanceof Error && error.message === "FORBIDDEN") return fail("Forbidden", 403);
    return fail("Unauthorized", 401);
  }
}
