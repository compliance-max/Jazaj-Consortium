import { fail, ok } from "@/lib/http";
import { ensureEmployerActiveForMutation, requirePortalContext } from "@/lib/auth/guard";
import { createEmployerDriver, deactivateEmployerDriver, listEmployerDrivers, updateEmployerDriver } from "@/lib/services/drivers";
import { driverCreateSchema, driverDeactivateSchema, driverUpdateSchema } from "@/lib/validation/driver";

export async function GET() {
  try {
    const { employer } = await requirePortalContext();
    const drivers = await listEmployerDrivers(employer.id);
    return ok({ drivers });
  } catch {
    return fail("Unauthorized", 401);
  }
}

export async function POST(req: Request) {
  try {
    const { user, employer } = await requirePortalContext();
    ensureEmployerActiveForMutation(employer.status);

    const body = await req.json().catch(() => null);
    const parsed = driverCreateSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const driver = await createEmployerDriver(employer.id, parsed.data, user.id);
    return ok({ driver }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === "EMPLOYER_INACTIVE") {
      return fail("Employer is inactive", 403);
    }
    return fail("Unauthorized", 401);
  }
}

export async function PUT(req: Request) {
  try {
    const { user, employer } = await requirePortalContext();
    ensureEmployerActiveForMutation(employer.status);

    const body = await req.json().catch(() => null);
    const parsed = driverUpdateSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const driver = await updateEmployerDriver(employer.id, parsed.data, user.id);
    if (!driver) return fail("Driver not found", 404);
    return ok({ driver });
  } catch (error) {
    if (error instanceof Error && error.message === "EMPLOYER_INACTIVE") {
      return fail("Employer is inactive", 403);
    }
    return fail("Unauthorized", 401);
  }
}

export async function DELETE(req: Request) {
  try {
    const { user, employer } = await requirePortalContext();
    ensureEmployerActiveForMutation(employer.status);

    const body = await req.json().catch(() => null);
    const parsed = driverDeactivateSchema.safeParse(body);
    if (!parsed.success) return fail(parsed.error.issues[0]?.message || "Invalid payload", 422);

    const deactivated = await deactivateEmployerDriver(employer.id, parsed.data.id, user.id);
    if (!deactivated) return fail("Driver not found", 404);
    return ok({ deactivated: true });
  } catch (error) {
    if (error instanceof Error && error.message === "EMPLOYER_INACTIVE") {
      return fail("Employer is inactive", 403);
    }
    return fail("Unauthorized", 401);
  }
}
