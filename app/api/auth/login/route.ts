import { z } from "zod";
import { signIn } from "@/auth";
import { fail, ok } from "@/lib/http";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Invalid payload", 422);

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false
    });
    return ok({ success: true });
  } catch {
    return fail("Invalid credentials", 401);
  }
}
