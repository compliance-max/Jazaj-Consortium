import { prisma } from "@/lib/db/prisma";
import { normalizeDriverInput } from "@/lib/validation/driver";
import { assignDriverToEmployerPool, closeDriverMembership } from "@/lib/services/pools";

export async function listEmployerDrivers(employerId: string) {
  return prisma.driver.findMany({
    where: { employerId },
    orderBy: [{ active: "desc" }, { lastName: "asc" }, { firstName: "asc" }],
    include: {
      currentPool: {
        select: { id: true, type: true, dotAgency: true, cadence: true }
      }
    }
  });
}

export async function createEmployerDriver(
  employerId: string,
  raw: Parameters<typeof normalizeDriverInput>[0],
  changedByUserId?: string | null
) {
  const input = normalizeDriverInput(raw);
  return prisma.$transaction(async (tx) => {
    const driver = await tx.driver.create({
      data: {
        employerId,
        ...input,
        currentPoolId: null
      }
    });

    if (driver.active) {
      await assignDriverToEmployerPool(tx, {
        driverId: driver.id,
        employerId,
        changedByUserId,
        reason: "driver_created"
      });
    }

    return tx.driver.findUnique({
      where: { id: driver.id },
      include: {
        currentPool: {
          select: { id: true, type: true, dotAgency: true, cadence: true }
        }
      }
    });
  });
}

export async function updateEmployerDriver(
  employerId: string,
  input: { id: string } & Parameters<typeof normalizeDriverInput>[0],
  changedByUserId?: string | null
) {
  const normalized = normalizeDriverInput(input);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.driver.findFirst({
      where: { id: input.id, employerId }
    });
    if (!existing) return null;

    const updated = await tx.driver.update({
      where: { id: input.id },
      data: {
        ...normalized
      }
    });

    if (existing.active && !updated.active) {
      await closeDriverMembership(tx, {
        driverId: updated.id,
        employerId,
        changedByUserId,
        reason: "driver_deactivated"
      });
    } else if (!existing.active && updated.active) {
      await assignDriverToEmployerPool(tx, {
        driverId: updated.id,
        employerId,
        changedByUserId,
        reason: "driver_reactivated"
      });
    } else if (updated.active) {
      const employer = await tx.employer.findUnique({
        where: { id: employerId },
        select: { activePoolId: true }
      });
      if (employer?.activePoolId && employer.activePoolId !== updated.currentPoolId) {
        await assignDriverToEmployerPool(tx, {
          driverId: updated.id,
          employerId,
          changedByUserId,
          reason: "driver_pool_sync"
        });
      }
    }

    return tx.driver.findUnique({
      where: { id: updated.id },
      include: {
        currentPool: {
          select: { id: true, type: true, dotAgency: true, cadence: true }
        }
      }
    });
  });
}

export async function deactivateEmployerDriver(employerId: string, id: string, changedByUserId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.driver.findFirst({
      where: { id, employerId }
    });
    if (!existing) return false;

    await tx.driver.update({
      where: { id },
      data: { active: false }
    });

    await closeDriverMembership(tx, {
      driverId: id,
      employerId,
      changedByUserId,
      reason: "driver_deactivated"
    });

    return true;
  });
}
