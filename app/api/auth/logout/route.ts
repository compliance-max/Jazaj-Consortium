import { signOut } from "@/auth";
import { ok } from "@/lib/http";

export async function POST() {
  await signOut({ redirect: false });
  return ok({ success: true });
}
