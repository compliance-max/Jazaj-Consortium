import { cookies } from "next/headers";
import { auth } from "@/auth";
import { fail, ok } from "@/lib/http";
import { getActiveConversationForActor } from "@/lib/services/chat";

const GUEST_COOKIE = "cm_guest_chat_token";

export async function GET() {
  const session = await auth();
  if (session?.user?.id && session.user.role === "EMPLOYER_DER" && session.user.employerId) {
    const conversation = await getActiveConversationForActor({
      kind: "MEMBER",
      userId: session.user.id,
      employerId: session.user.employerId
    });
    const guestToken = cookies().get(GUEST_COOKIE)?.value;
    const guestConversation = guestToken
      ? await getActiveConversationForActor({
          kind: "GUEST",
          guestToken
        })
      : null;
    const hasGuestConversation = Boolean(guestConversation && guestConversation.id !== conversation?.id);
    return ok({ conversation, hasGuestConversation });
  }

  const guestToken = cookies().get(GUEST_COOKIE)?.value;
  if (!guestToken) return ok({ conversation: null, hasGuestConversation: false });
  const conversation = await getActiveConversationForActor({
    kind: "GUEST",
    guestToken
  });
  return ok({ conversation, hasGuestConversation: Boolean(conversation) });
}

export async function POST() {
  return fail("Method not allowed", 405);
}
