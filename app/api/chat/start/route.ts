import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { fail } from "@/lib/http";
import { startChatConversation, createGuestChatToken } from "@/lib/services/chat";

const GUEST_COOKIE = "cm_guest_chat_token";

const schema = z.object({
  asGuest: z.boolean().optional(),
  guestName: z.string().max(120).optional().nullable(),
  guestEmail: z.string().email().max(160).optional().nullable(),
  mergeGuest: z.boolean().optional()
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body || {});
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

  const session = await auth();
  const cookieStore = cookies();
  const guestCookie = cookieStore.get(GUEST_COOKIE)?.value || null;

  if (session?.user?.id && session.user.role === "EMPLOYER_DER" && session.user.employerId && !parsed.data.asGuest) {
    const result = await startChatConversation({
      actor: {
        kind: "MEMBER",
        userId: session.user.id,
        employerId: session.user.employerId
      },
      mergeGuest: parsed.data.mergeGuest,
      mergeGuestToken: guestCookie
    });

    const response = NextResponse.json({
      conversation: result.conversation
    });
    if (parsed.data.mergeGuest && guestCookie) {
      response.cookies.delete(GUEST_COOKIE);
    }
    return response;
  }

  const guestToken = guestCookie || createGuestChatToken();
  const result = await startChatConversation({
    actor: {
      kind: "GUEST",
      guestToken
    },
    asGuest: true,
    guestName: parsed.data.guestName || null,
    guestEmail: parsed.data.guestEmail || null
  });

  const response = NextResponse.json({
    conversation: result.conversation
  });
  response.cookies.set(GUEST_COOKIE, guestToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
  return response;
}
