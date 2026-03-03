import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { getRateConfigForYear, upsertRateConfig } from "@/lib/services/random/compliance";

const yearQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100)
});

const updateSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  drugRate: z.number().positive(),
  alcoholRate: z.number().nonnegative()
});

export async function GET(req: Request) {
  try {
    await requireAdminOrManager();
    const { searchParams } = new URL(req.url);
    const parsed = yearQuerySchema.safeParse({
      year: searchParams.get("year")
    });
    if (!parsed.success) return fail("Invalid year", 422);

    const rate = await getRateConfigForYear(parsed.data.year);
    return ok({ rate });
  } catch {
    return fail("Forbidden", 403);
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdminOrManager();
    const body = await req.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const normalizedDrugRate = parsed.data.drugRate > 1 ? parsed.data.drugRate / 100 : parsed.data.drugRate;
    const normalizedAlcoholRate =
      parsed.data.alcoholRate > 1 ? parsed.data.alcoholRate / 100 : parsed.data.alcoholRate;

    const rate = await upsertRateConfig({
      year: parsed.data.year,
      drugRate: normalizedDrugRate,
      alcoholRate: normalizedAlcoholRate
    });
    return ok({ rate });
  } catch {
    return fail("Forbidden", 403);
  }
}
