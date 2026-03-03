import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";

const createSchema = z.object({
  name: z.string().min(2).max(200),
  address: z.string().min(4).max(240),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().email().max(160).optional().nullable(),
  instructions: z.string().max(4000).optional().nullable()
});

export async function GET() {
  try {
    await requireAdminOrManager();
    const clinics = await prisma.clinic.findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }]
    });
    return ok({ clinics });
  } catch {
    return fail("Forbidden", 403);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminOrManager();
    const body = await req.json().catch(() => null);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const clinic = await prisma.clinic.create({
      data: {
        name: parsed.data.name.trim(),
        address: parsed.data.address.trim(),
        phone: parsed.data.phone?.trim() || null,
        email: parsed.data.email?.trim().toLowerCase() || null,
        instructions: parsed.data.instructions?.trim() || null
      }
    });
    return ok({ clinic }, 201);
  } catch {
    return fail("Forbidden", 403);
  }
}
