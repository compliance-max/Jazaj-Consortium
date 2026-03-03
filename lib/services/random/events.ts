import { Prisma, UserRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

type Tx = Prisma.TransactionClient;

export async function getRandomEventAuditView(eventId: string) {
  return prisma.randomSelectionEvent.findUnique({
    where: { id: eventId },
    include: {
      pool: {
        select: {
          id: true,
          type: true,
          employerId: true,
          dotAgency: true,
          cadence: true
        }
      },
      randomPeriod: true,
      eligibleDrivers: {
        include: {
          driver: {
            select: {
              id: true,
              employerId: true,
              firstName: true,
              lastName: true,
              active: true,
              dotCovered: true
            }
          }
        },
        orderBy: {
          driverId: "asc"
        }
      },
      selectedDrivers: {
        include: {
          driver: {
            select: {
              id: true,
              employerId: true,
              firstName: true,
              lastName: true
            }
          },
          testRequest: true
        },
        orderBy: {
          driverId: "asc"
        }
      }
    }
  });
}

async function assertReplacementEligible(tx: Tx, input: { driverId: string; eventId: string }) {
  const exists = await tx.randomEligibleDriver.findFirst({
    where: {
      selectionEventId: input.eventId,
      driverId: input.driverId
    }
  });
  return Boolean(exists);
}

export async function replaceSelectedDriver(input: {
  selectedDriverId: string;
  replacementDriverId: string;
  overrideReason: string;
  actorUserId: string;
  actorRole: UserRole;
}) {
  return prisma.$transaction(async (tx) => {
    const selected = await tx.randomSelectedDriver.findUnique({
      where: { id: input.selectedDriverId },
      include: {
        selectionEvent: {
          include: {
            randomPeriod: true
          }
        }
      }
    });
    if (!selected) throw new Error("SELECTED_DRIVER_NOT_FOUND");

    if (selected.selectionEvent.selectionLocked) {
      if (input.actorRole !== "CTPA_ADMIN") {
        throw new Error("LOCKED_SELECTION_ADMIN_ONLY");
      }
      if (!input.overrideReason || input.overrideReason.trim().length < 10) {
        throw new Error("OVERRIDE_REASON_REQUIRED");
      }
    }

    const replacement = await tx.driver.findUnique({
      where: { id: input.replacementDriverId }
    });
    if (!replacement) throw new Error("REPLACEMENT_DRIVER_NOT_FOUND");
    if (replacement.employerId !== selected.employerId) throw new Error("REPLACEMENT_EMPLOYER_MISMATCH");
    if (!replacement.active || !replacement.dotCovered) throw new Error("REPLACEMENT_NOT_ELIGIBLE");
    if (replacement.currentPoolId !== selected.selectionEvent.poolId) throw new Error("REPLACEMENT_POOL_MISMATCH");

    const alreadySelected = await tx.randomSelectedDriver.findFirst({
      where: {
        selectionEventId: selected.selectionEventId,
        driverId: replacement.id
      }
    });
    if (alreadySelected) throw new Error("REPLACEMENT_ALREADY_SELECTED");

    const eligible = await assertReplacementEligible(tx, {
      driverId: replacement.id,
      eventId: selected.selectionEventId
    });
    if (!eligible) throw new Error("REPLACEMENT_NOT_IN_ELIGIBLE_SET");

    const replacementRequest = await tx.testRequest.create({
      data: {
        employerId: selected.employerId,
        driverId: replacement.id,
        requestedByUserId: input.actorUserId,
        reason: "RANDOM",
        testType: selected.testType,
        priceCents: 0,
        paid: true,
        status: "REQUESTED"
      }
    });

    await tx.randomSelectedDriver.update({
      where: { id: selected.id },
      data: {
        status: "REPLACED",
        overrideReason: input.overrideReason,
        overriddenByUserId: input.actorUserId
      }
    });

    if (selected.testRequestId) {
      await tx.testRequest.update({
        where: { id: selected.testRequestId },
        data: {
          status: "CANCELLED"
        }
      });
    }

    const created = await tx.randomSelectedDriver.create({
      data: {
        selectionEventId: selected.selectionEventId,
        driverId: replacement.id,
        employerId: selected.employerId,
        testType: selected.testType,
        status: "SELECTED",
        testRequestId: replacementRequest.id,
        alternateOfSelectedId: selected.id,
        overrideReason: input.overrideReason,
        overriddenByUserId: input.actorUserId
      }
    });

    await tx.auditLog.create({
      data: {
        userId: input.actorUserId,
        employerId: selected.employerId,
        action: "SELECT_ALTERNATE",
        entityType: "RandomSelectedDriver",
        entityId: created.id,
        metadata: {
          originalSelectedDriverId: selected.id,
          replacementDriverId: replacement.id,
          overrideReason: input.overrideReason
        }
      }
    });

    return created;
  });
}
