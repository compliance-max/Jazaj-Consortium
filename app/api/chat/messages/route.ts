import { cookies } from "next/headers";
import { z } from "zod";
import { auth } from "@/auth";
import { fail, ok } from "@/lib/http";
import { listConversationMessages } from "@/lib/services/chat";

const GUEST_COOKIE = "cm_guest_chat_token";

const querySchema = z.object({
  conversationId: z.string().min(1),
  mark_read: z.string().optional()
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    conversationId: searchParams.get("conversationId") || "",
    mark_read: searchParams.get("mark_read") || undefined
  });
  if (!parsed.success) return fail("Invalid query", 422);

  const markRead = parsed.data.mark_read === "1" || parsed.data.mark_read === "true";
  const session = await auth();
  try {
    if (session?.user?.id && (session.user.role === "CTPA_ADMIN" || session.user.role === "CTPA_MANAGER")) {
      const messages = await listConversationMessages({
        actor: {
          kind: "ADMIN",
          userId: session.user.id,
          role: session.user.role
        },
        conversationId: parsed.data.conversationId,
        markRead
      });
      return ok({ messages });
    }

    if (session?.user?.id && session.user.role === "EMPLOYER_DER" && session.user.employerId) {
      const messages = await listConversationMessages({
        actor: {
          kind: "MEMBER",
          userId: session.user.id,
          employerId: session.user.employerId
        },
        conversationId: parsed.data.conversationId,
        markRead
      });
      return ok({ messages });
    }

    const guestToken = cookies().get(GUEST_COOKIE)?.value;
    if (!guestToken) return fail("Unauthorized", 401);
    const messages = await listConversationMessages({
      actor: {
        kind: "GUEST",
        guestToken
      },
      conversationId: parsed.data.conversationId,
      markRead
    });
    return ok({ messages });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") return fail("Not found", 404);
    if (error instanceof Error && error.message === "FORBIDDEN") return fail("Forbidden", 403);
    return fail("Unauthorized", 401);
  }
}
