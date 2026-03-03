import { DotAgency, Employer, PoolType, Prisma } from "@prisma/client";

type DbClient = Prisma.TransactionClient;

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function getOrCreateMasterPool(
  tx: DbClient,
  options: { dotAgency?: DotAgency; timezone?: string } = {}
) {
  const dotAgency = options.dotAgency || "FMCSA";
  const timezone = options.timezone || "America/Detroit";

  const existing = await tx.pool.findFirst({
    where: { type: "MASTER", dotAgency }
  });
  if (existing) return existing;

  try {
    return await tx.pool.create({
      data: {
        type: "MASTER",
        dotAgency,
        cadence: "QUARTERLY",
        timezone
      }
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const pooled = await tx.pool.findFirst({
      where: { type: "MASTER", dotAgency }
    });
    if (!pooled) throw error;
    return pooled;
  }
}

export async function getOrCreateIndividualPool(tx: DbClient, employerId: string, timezone?: string) {
  const existing = await tx.pool.findFirst({
    where: { type: "INDIVIDUAL", employerId }
  });
  if (existing) return existing;

  try {
    return await tx.pool.create({
      data: {
        type: "INDIVIDUAL",
        employerId,
        dotAgency: "FMCSA",
        cadence: "QUARTERLY",
        timezone: timezone || "America/Detroit"
      }
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const pooled = await tx.pool.findFirst({
      where: { type: "INDIVIDUAL", employerId }
    });
    if (!pooled) throw error;
    return pooled;
  }
}

export async function resolvePoolForEmployer(tx: DbClient, employer: Pick<Employer, "id" | "poolMode" | "timezone">) {
  if (employer.poolMode === "MASTER") {
    return getOrCreateMasterPool(tx, { dotAgency: "FMCSA", timezone: employer.timezone });
  }
  return getOrCreateIndividualPool(tx, employer.id, employer.timezone);
}

export async function ensureEmployerActivePool(
  tx: DbClient,
  employer: Pick<Employer, "id" | "poolMode" | "timezone" | "activePoolId">
) {
  if (employer.activePoolId) {
    const activePool = await tx.pool.findUnique({ where: { id: employer.activePoolId } });
    if (activePool) {
      if (
        (employer.poolMode === "MASTER" && activePool.type === "MASTER") ||
        (employer.poolMode === "INDIVIDUAL" &&
          activePool.type === "INDIVIDUAL" &&
          activePool.employerId === employer.id)
      ) {
        return activePool;
      }
    }
  }

  const pool = await resolvePoolForEmployer(tx, employer);
  await tx.employer.update({
    where: { id: employer.id },
    data: { activePoolId: pool.id }
  });
  return pool;
}

export async function assignDriverToEmployerPool(
  tx: DbClient,
  input: {
    driverId: string;
    employerId: string;
    changedByUserId?: string | null;
    reason: string;
    at?: Date;
  }
) {
  const at = input.at || new Date();
  const employer = await tx.employer.findUnique({
    where: { id: input.employerId },
    select: {
      id: true,
      poolMode: true,
      timezone: true,
      activePoolId: true
    }
  });
  if (!employer) throw new Error("EMPLOYER_NOT_FOUND");

  const pool = await ensureEmployerActivePool(tx, employer);

  await tx.driverPoolMembership.updateMany({
    where: { driverId: input.driverId, effectiveEnd: null },
    data: { effectiveEnd: at }
  });

  const membership = await tx.driverPoolMembership.create({
    data: {
      driverId: input.driverId,
      poolId: pool.id,
      changedByUserId: input.changedByUserId || null,
      reason: input.reason,
      effectiveStart: at
    }
  });

  await tx.driver.update({
    where: { id: input.driverId },
    data: { currentPoolId: pool.id }
  });

  await tx.auditLog.create({
    data: {
      userId: input.changedByUserId || null,
      employerId: input.employerId,
      action: "DRIVER_POOL_ASSIGNED",
      entityType: "DriverPoolMembership",
      entityId: membership.id,
      metadata: {
        poolId: pool.id,
        driverId: input.driverId,
        reason: input.reason
      }
    }
  });

  return { pool, membership };
}

export async function closeDriverMembership(
  tx: DbClient,
  input: {
    driverId: string;
    employerId: string;
    changedByUserId?: string | null;
    reason: string;
    at?: Date;
  }
) {
  const at = input.at || new Date();
  const closed = await tx.driverPoolMembership.updateMany({
    where: { driverId: input.driverId, effectiveEnd: null },
    data: { effectiveEnd: at }
  });

  await tx.driver.update({
    where: { id: input.driverId },
    data: { currentPoolId: null }
  });

  await tx.auditLog.create({
    data: {
      userId: input.changedByUserId || null,
      employerId: input.employerId,
      action: "DRIVER_POOL_CLOSED",
      entityType: "Driver",
      entityId: input.driverId,
      metadata: {
        closedMemberships: closed.count,
        reason: input.reason
      }
    }
  });

  return closed.count;
}

export async function switchEmployerPoolMode(
  tx: DbClient,
  input: {
    employerId: string;
    newPoolMode: PoolType;
    migrateDrivers: boolean;
    changedByUserId?: string | null;
  }
) {
  const employer = await tx.employer.findUnique({
    where: { id: input.employerId }
  });
  if (!employer) throw new Error("EMPLOYER_NOT_FOUND");

  const targetPool = await resolvePoolForEmployer(tx, {
    id: employer.id,
    poolMode: input.newPoolMode,
    timezone: employer.timezone
  });

  await tx.employer.update({
    where: { id: employer.id },
    data: {
      poolMode: input.newPoolMode,
      activePoolId: targetPool.id
    }
  });

  const summary = {
    movedDrivers: 0,
    closedMemberships: 0,
    createdMemberships: 0
  };

  await tx.auditLog.create({
    data: {
      userId: input.changedByUserId || null,
      employerId: employer.id,
      action: "EMPLOYER_POOL_MODE_SWITCH",
      entityType: "Employer",
      entityId: employer.id,
      metadata: {
        from: employer.poolMode,
        to: input.newPoolMode,
        migrateDrivers: input.migrateDrivers,
        targetPoolId: targetPool.id
      }
    }
  });

  if (!input.migrateDrivers) {
    return { targetPool, summary };
  }

  const activeDrivers = await tx.driver.findMany({
    where: { employerId: employer.id, active: true },
    select: { id: true, currentPoolId: true }
  });

  const at = new Date();
  for (const driver of activeDrivers) {
    if (driver.currentPoolId === targetPool.id) continue;

    const closed = await tx.driverPoolMembership.updateMany({
      where: { driverId: driver.id, effectiveEnd: null },
      data: { effectiveEnd: at }
    });
    summary.closedMemberships += closed.count;

    const membership = await tx.driverPoolMembership.create({
      data: {
        driverId: driver.id,
        poolId: targetPool.id,
        changedByUserId: input.changedByUserId || null,
        reason: "pool_mode_switch",
        effectiveStart: at
      }
    });
    summary.createdMemberships += 1;
    summary.movedDrivers += 1;

    await tx.driver.update({
      where: { id: driver.id },
      data: { currentPoolId: targetPool.id }
    });

    await tx.auditLog.create({
      data: {
        userId: input.changedByUserId || null,
        employerId: employer.id,
        action: "DRIVER_POOL_MIGRATED",
        entityType: "Driver",
        entityId: driver.id,
        metadata: {
          fromPoolId: driver.currentPoolId,
          toPoolId: targetPool.id,
          membershipId: membership.id,
          reason: "pool_mode_switch"
        }
      }
    });
  }

  return { targetPool, summary };
}
