import { Pool, Prisma, TestType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { PERIODS_PER_YEAR, RANDOM_ALGORITHM_VERSION } from "@/lib/services/random/constants";
import { getOrCreateRandomPeriod, resolveQuarter } from "@/lib/services/random/period";
import { buildRandomHmac, secureShuffle, sortedIdsHash } from "@/lib/services/random/proof";
import { getOrCreateDotRateConfig, recalculateComplianceForPoolYear } from "@/lib/services/random/compliance";
import { sendRandomNoSelectionNotice, sendRandomSelectionNotice, sendQuarterEndRosterReviewEmail } from "@/lib/email/postmark";

type Tx = Prisma.TransactionClient;

type EligibleDriver = {
  driverId: string;
  employerId: string;
  firstName: string;
  lastName: string;
};

type PoolRunNotice = {
  employerId: string;
  to: string;
  kind: "selected" | "no_selection";
  quarter: number;
  year: number;
  poolSize: number;
  selectedDrivers: Array<{ firstName: string; lastName: string; testType: "DRUG" | "ALCOHOL" | "BOTH" }>;
};

type PoolRunResult = {
  poolId: string;
  randomPeriodId: string;
  employerId: string | null;
  eventId: string | null;
  created: boolean;
  dryRun: boolean;
  eligibleCount: number;
  selectedCountDrug: number;
  selectedCountAlcohol: number;
  eligibleHash: string;
  selectedHashDrug: string;
  selectedHashAlcohol: string;
  randomHmac: string;
  selectionLocked: boolean;
  selectedDrivers: Array<{ driverId: string; employerId: string; firstName: string; lastName: string; testType: TestType }>;
  notices: PoolRunNotice[];
};

type RunRandomOptions = {
  dryRun?: boolean;
  commit?: boolean;
  year?: number;
  quarter?: number;
  employerId?: string;
  force?: boolean;
  overrideReason?: string;
  requestedByUserId?: string | null;
};

function targetForPeriod(input: {
  required: number;
  selectedBefore: number;
  eligibleCount: number;
  periodNumber: number;
}) {
  const plannedPerPeriod = Math.ceil(input.required / PERIODS_PER_YEAR);
  const plannedBefore = plannedPerPeriod * Math.max(0, input.periodNumber - 1);
  const carryover = Math.max(0, plannedBefore - input.selectedBefore);
  const remainingRequired = Math.max(0, input.required - input.selectedBefore);
  return Math.max(
    0,
    Math.min(input.eligibleCount, remainingRequired, plannedPerPeriod + carryover)
  );
}

function resolveSelection(
  eligible: EligibleDriver[],
  targetDrug: number,
  targetAlcohol: number
) {
  const eligibleIds = eligible.map((row) => row.driverId);
  const drugShuffled = secureShuffle(eligibleIds);
  const alcoholShuffled = secureShuffle(eligibleIds);

  const selectedMap = new Map<string, TestType>();
  for (const driverId of drugShuffled.slice(0, targetDrug)) {
    selectedMap.set(driverId, "DRUG");
  }

  let alcoholAdded = 0;
  for (const driverId of alcoholShuffled) {
    if (alcoholAdded >= targetAlcohol) break;
    const existing = selectedMap.get(driverId);
    if (!existing) {
      selectedMap.set(driverId, "ALCOHOL");
      alcoholAdded += 1;
      continue;
    }
    if (existing === "DRUG") {
      selectedMap.set(driverId, "BOTH");
      alcoholAdded += 1;
    }
  }

  const selectedDrivers = eligible
    .filter((row) => selectedMap.has(row.driverId))
    .map((row) => ({
      ...row,
      testType: selectedMap.get(row.driverId) as TestType
    }));

  const selectedDrugIds = selectedDrivers
    .filter((row) => row.testType === "DRUG" || row.testType === "BOTH")
    .map((row) => row.driverId);
  const selectedAlcoholIds = selectedDrivers
    .filter((row) => row.testType === "ALCOHOL" || row.testType === "BOTH")
    .map((row) => row.driverId);

  return {
    selectedDrivers,
    selectedDrugIds,
    selectedAlcoholIds
  };
}

async function resolvePoolsForRun(
  tx: Tx,
  options: { employerId?: string; force?: boolean }
) {
  if (options.employerId) {
    const employer = await tx.employer.findUnique({
      where: { id: options.employerId },
      include: {
        activePool: true
      }
    });
    if (!employer || !employer.activePool) return [];
    if (employer.status !== "ACTIVE" && !options.force) return [];
    return [employer.activePool];
  }

  const employers = await tx.employer.findMany({
    where: { status: "ACTIVE", activePoolId: { not: null } },
    include: { activePool: true }
  });
  const unique = new Map<string, Pool>();
  for (const employer of employers) {
    if (employer.activePool) unique.set(employer.activePool.id, employer.activePool);
  }
  return [...unique.values()];
}

async function loadEligibleDrivers(
  tx: Tx,
  pool: Pool,
  period: { startDate: Date; endDate: Date },
  forceEmployerId?: string
) {
  const includeInactiveEmployer =
    Boolean(forceEmployerId) && Boolean(pool.employerId) && pool.employerId === forceEmployerId;
  const employerFilter =
    pool.type === "MASTER"
      ? forceEmployerId
        ? { OR: [{ status: "ACTIVE" as const }, { id: forceEmployerId }] }
        : { status: "ACTIVE" as const }
      : includeInactiveEmployer
        ? undefined
        : { status: "ACTIVE" as const };

  const memberships = await tx.driverPoolMembership.findMany({
    where: {
      poolId: pool.id,
      effectiveStart: { lte: period.endDate },
      OR: [{ effectiveEnd: null }, { effectiveEnd: { gte: period.startDate } }],
      driver: {
        active: true,
        dotCovered: true,
        currentPoolId: pool.id,
        ...(employerFilter ? { employer: employerFilter } : {})
      }
    },
    include: {
      driver: {
        select: {
          id: true,
          employerId: true,
          firstName: true,
          lastName: true
        }
      }
    },
    orderBy: { effectiveStart: "desc" }
  });

  const deduped = new Map<string, EligibleDriver>();
  for (const row of memberships) {
    if (!deduped.has(row.driver.id)) {
      deduped.set(row.driver.id, {
        driverId: row.driver.id,
        employerId: row.driver.employerId,
        firstName: row.driver.firstName,
        lastName: row.driver.lastName
      });
    }
  }

  return [...deduped.values()];
}

async function upsertSnapshots(
  tx: Tx,
  input: {
    pool: Pool;
    randomPeriodId: string;
    eligibleDrivers: EligibleDriver[];
  }
) {
  if (input.pool.type === "MASTER") {
    const existingMaster = await tx.poolSnapshot.findFirst({
      where: {
        poolId: input.pool.id,
        randomPeriodId: input.randomPeriodId,
        employerId: null
      },
      select: { id: true }
    });
    if (existingMaster) {
      await tx.poolSnapshot.update({
        where: { id: existingMaster.id },
        data: {
          coveredDriverCount: input.eligibleDrivers.length
        }
      });
    } else {
      await tx.poolSnapshot.create({
        data: {
          poolId: input.pool.id,
          randomPeriodId: input.randomPeriodId,
          employerId: null,
          coveredDriverCount: input.eligibleDrivers.length
        }
      });
    }

    const byEmployer = new Map<string, number>();
    for (const row of input.eligibleDrivers) {
      byEmployer.set(row.employerId, (byEmployer.get(row.employerId) || 0) + 1);
    }

    for (const [employerId, coveredDriverCount] of byEmployer.entries()) {
      await tx.poolSnapshot.upsert({
        where: {
          poolId_randomPeriodId_employerId: {
            poolId: input.pool.id,
            randomPeriodId: input.randomPeriodId,
            employerId
          }
        },
        create: {
          poolId: input.pool.id,
          randomPeriodId: input.randomPeriodId,
          employerId,
          coveredDriverCount
        },
        update: {
          coveredDriverCount
        }
      });
    }
    return;
  }

  if (input.pool.employerId) {
    await tx.poolSnapshot.upsert({
      where: {
        poolId_randomPeriodId_employerId: {
          poolId: input.pool.id,
          randomPeriodId: input.randomPeriodId,
          employerId: input.pool.employerId
        }
      },
      create: {
        poolId: input.pool.id,
        randomPeriodId: input.randomPeriodId,
        employerId: input.pool.employerId,
        coveredDriverCount: input.eligibleDrivers.length
      },
      update: {
        coveredDriverCount: input.eligibleDrivers.length
      }
    });
  } else {
    const existing = await tx.poolSnapshot.findFirst({
      where: {
        poolId: input.pool.id,
        randomPeriodId: input.randomPeriodId,
        employerId: null
      },
      select: { id: true }
    });
    if (existing) {
      await tx.poolSnapshot.update({
        where: { id: existing.id },
        data: { coveredDriverCount: input.eligibleDrivers.length }
      });
    } else {
      await tx.poolSnapshot.create({
        data: {
          poolId: input.pool.id,
          randomPeriodId: input.randomPeriodId,
          employerId: null,
          coveredDriverCount: input.eligibleDrivers.length
        }
      });
    }
  }
}

async function computeRequiredCounts(
  tx: Tx,
  input: {
    pool: Pool;
    year: number;
    periodNumber: number;
    currentCoveredCount: number;
  }
) {
  const scopeEmployerId = input.pool.type === "MASTER" ? null : input.pool.employerId;
  const snapshots = await tx.poolSnapshot.findMany({
    where: {
      poolId: input.pool.id,
      employerId: scopeEmployerId,
      randomPeriod: {
        year: input.year,
        periodNumber: { lte: input.periodNumber }
      }
    },
    include: {
      randomPeriod: {
        select: { periodNumber: true }
      }
    }
  });

  const snapshotByPeriod = new Map<number, number>();
  for (const snapshot of snapshots) {
    snapshotByPeriod.set(snapshot.randomPeriod.periodNumber, snapshot.coveredDriverCount);
  }
  if (!snapshotByPeriod.has(input.periodNumber)) {
    snapshotByPeriod.set(input.periodNumber, input.currentCoveredCount);
  }

  const snapshotValues = [...snapshotByPeriod.values()];
  const avgCoveredDrivers =
    snapshotValues.length === 0
      ? 0
      : snapshotValues.reduce((sum, value) => sum + value, 0) / snapshotValues.length;

  const rate = await getOrCreateDotRateConfig(tx, input.year, "FMCSA");
  const requiredDrug = Math.ceil(avgCoveredDrivers * rate.drugRate);
  const requiredAlcohol = Math.ceil(avgCoveredDrivers * rate.alcoholRate);

  const selectedBefore = await tx.randomSelectionEvent.aggregate({
    where: {
      poolId: input.pool.id,
      randomPeriod: {
        year: input.year,
        periodNumber: { lt: input.periodNumber }
      }
    },
    _sum: {
      selectedCountDrug: true,
      selectedCountAlcohol: true
    }
  });

  return {
    requiredDrug,
    requiredAlcohol,
    selectedBeforeDrug: selectedBefore._sum.selectedCountDrug || 0,
    selectedBeforeAlcohol: selectedBefore._sum.selectedCountAlcohol || 0
  };
}

function buildNotices(input: {
  pool: Pool;
  year: number;
  quarter: number;
  eligibleDrivers: EligibleDriver[];
  selectedDrivers: Array<{ driverId: string; employerId: string; firstName: string; lastName: string; testType: TestType }>;
  derUsers: Array<{ employerId: string | null; email: string }>;
}) {
  const selectedByEmployer = new Map<
    string,
    Array<{ firstName: string; lastName: string; testType: "DRUG" | "ALCOHOL" | "BOTH" }>
  >();
  for (const row of input.selectedDrivers) {
    const mappedType = row.testType as "DRUG" | "ALCOHOL" | "BOTH";
    const existing = selectedByEmployer.get(row.employerId) || [];
    existing.push({ firstName: row.firstName, lastName: row.lastName, testType: mappedType });
    selectedByEmployer.set(row.employerId, existing);
  }

  const eligibleByEmployer = new Map<string, number>();
  for (const row of input.eligibleDrivers) {
    eligibleByEmployer.set(row.employerId, (eligibleByEmployer.get(row.employerId) || 0) + 1);
  }

  const notices: PoolRunNotice[] = [];
  for (const user of input.derUsers) {
    if (!user.employerId) continue;
    const selected = selectedByEmployer.get(user.employerId) || [];
    if (selected.length > 0) {
      notices.push({
        employerId: user.employerId,
        to: user.email,
        kind: "selected",
        year: input.year,
        quarter: input.quarter,
        poolSize: eligibleByEmployer.get(user.employerId) || 0,
        selectedDrivers: selected
      });
    } else {
      notices.push({
        employerId: user.employerId,
        to: user.email,
        kind: "no_selection",
        year: input.year,
        quarter: input.quarter,
        poolSize: eligibleByEmployer.get(user.employerId) || 0,
        selectedDrivers: []
      });
    }
  }

  return notices;
}

async function runForPool(
  tx: Tx,
  input: {
    pool: Pool;
    year: number;
    quarter: number;
    commit: boolean;
    dryRun: boolean;
    force?: boolean;
    forceEmployerId?: string;
    overrideReason?: string;
    requestedByUserId?: string | null;
  }
): Promise<PoolRunResult> {
  const period = await getOrCreateRandomPeriod(tx, input.year, input.quarter);
  const existing = await tx.randomSelectionEvent.findUnique({
    where: {
      poolId_randomPeriodId: {
        poolId: input.pool.id,
        randomPeriodId: period.id
      }
    },
    include: {
      selectedDrivers: {
        include: {
          driver: {
            select: {
              firstName: true,
              lastName: true
            }
          }
        }
      }
    }
  });

  if (input.commit && existing) {
    await tx.auditLog.create({
      data: {
        userId: input.requestedByUserId || null,
        employerId: existing.employerId,
        action: "RUN_RANDOM_SELECTION_IDEMPOTENT",
        entityType: "RandomSelectionEvent",
        entityId: existing.id,
        metadata: {
          poolId: input.pool.id,
          randomPeriodId: period.id,
          force: input.force === true,
          overrideReason: input.overrideReason || null
        }
      }
    });
    return {
      poolId: input.pool.id,
      randomPeriodId: period.id,
      employerId: existing.employerId,
      eventId: existing.id,
      created: false,
      dryRun: false,
      eligibleCount: existing.eligibleCount,
      selectedCountDrug: existing.selectedCountDrug,
      selectedCountAlcohol: existing.selectedCountAlcohol,
      eligibleHash: existing.eligibleHash,
      selectedHashDrug: existing.selectedHashDrug,
      selectedHashAlcohol: existing.selectedHashAlcohol,
      randomHmac: existing.randomHmac,
      selectionLocked: existing.selectionLocked,
      selectedDrivers: existing.selectedDrivers.map((row) => ({
        driverId: row.driverId,
        employerId: row.employerId,
        firstName: row.driver.firstName,
        lastName: row.driver.lastName,
        testType: row.testType
      })),
      notices: []
    };
  }

  const eligibleDrivers = await loadEligibleDrivers(tx, input.pool, period, input.forceEmployerId);
  const eligibleIds = eligibleDrivers.map((row) => row.driverId);
  const eligibleHash = sortedIdsHash(eligibleIds);

  const requiredCounts = await computeRequiredCounts(tx, {
    pool: input.pool,
    year: input.year,
    periodNumber: input.quarter,
    currentCoveredCount: eligibleDrivers.length
  });

  const targetDrug = targetForPeriod({
    required: requiredCounts.requiredDrug,
    selectedBefore: requiredCounts.selectedBeforeDrug,
    eligibleCount: eligibleDrivers.length,
    periodNumber: input.quarter
  });
  const targetAlcohol = targetForPeriod({
    required: requiredCounts.requiredAlcohol,
    selectedBefore: requiredCounts.selectedBeforeAlcohol,
    eligibleCount: eligibleDrivers.length,
    periodNumber: input.quarter
  });

  const selection = resolveSelection(eligibleDrivers, targetDrug, targetAlcohol);
  const selectedHashDrug = sortedIdsHash(selection.selectedDrugIds);
  const selectedHashAlcohol = sortedIdsHash(selection.selectedAlcoholIds);
  const runAt = new Date();
  const randomHmac = buildRandomHmac({
    poolId: input.pool.id,
    randomPeriodId: period.id,
    runAtIso: runAt.toISOString(),
    eligibleHash,
    selectedHashDrug,
    selectedHashAlcohol,
    algorithmVersion: RANDOM_ALGORITHM_VERSION
  });

  const employerScope = input.pool.type === "MASTER" ? null : input.pool.employerId;
  if (input.dryRun && !input.commit) {
    return {
      poolId: input.pool.id,
      randomPeriodId: period.id,
      employerId: employerScope,
      eventId: null,
      created: false,
      dryRun: true,
      eligibleCount: eligibleDrivers.length,
      selectedCountDrug: selection.selectedDrugIds.length,
      selectedCountAlcohol: selection.selectedAlcoholIds.length,
      eligibleHash,
      selectedHashDrug,
      selectedHashAlcohol,
      randomHmac,
      selectionLocked: true,
      selectedDrivers: selection.selectedDrivers,
      notices: []
    };
  }

  await upsertSnapshots(tx, {
    pool: input.pool,
    randomPeriodId: period.id,
    eligibleDrivers
  });

  const event = await tx.randomSelectionEvent.create({
    data: {
      poolId: input.pool.id,
      randomPeriodId: period.id,
      employerId: employerScope,
      eligibleCount: eligibleDrivers.length,
      selectedCountDrug: selection.selectedDrugIds.length,
      selectedCountAlcohol: selection.selectedAlcoholIds.length,
      eligibleHash,
      selectedHashDrug,
      selectedHashAlcohol,
      algorithmVersion: RANDOM_ALGORITHM_VERSION,
      randomHmac,
      selectionLocked: true,
      runAt
    }
  });

  if (eligibleDrivers.length > 0) {
    await tx.randomEligibleDriver.createMany({
      data: eligibleDrivers.map((row) => ({
        selectionEventId: event.id,
        driverId: row.driverId
      })),
      skipDuplicates: true
    });
  }

  for (const selected of selection.selectedDrivers) {
    const testRequest = await tx.testRequest.create({
      data: {
        employerId: selected.employerId,
        driverId: selected.driverId,
        requestedByUserId: input.requestedByUserId || null,
        reason: "RANDOM",
        testType: selected.testType,
        priceCents: 0,
        paid: true,
        status: "REQUESTED"
      }
    });

    await tx.randomSelectedDriver.create({
      data: {
        selectionEventId: event.id,
        driverId: selected.driverId,
        employerId: selected.employerId,
        testType: selected.testType,
        status: "SELECTED",
        testRequestId: testRequest.id
      }
    });
  }

  await tx.auditLog.create({
    data: {
      userId: input.requestedByUserId || null,
      employerId: employerScope,
      action: "RUN_RANDOM_SELECTION",
      entityType: "RandomSelectionEvent",
      entityId: event.id,
      metadata: {
        poolId: input.pool.id,
        randomPeriodId: period.id,
        eligibleCount: eligibleDrivers.length,
        selectedCountDrug: selection.selectedDrugIds.length,
        selectedCountAlcohol: selection.selectedAlcoholIds.length,
        eligibleHash,
        selectedHashDrug,
        selectedHashAlcohol,
        randomHmac,
        force: input.force === true,
        overrideReason: input.overrideReason || null
      }
    }
  });

  await recalculateComplianceForPoolYear(tx, {
    poolId: input.pool.id,
    year: input.year
  });

  let derUsers: Array<{ employerId: string | null; email: string }> = [];
  if (input.pool.type === "MASTER") {
    derUsers = await tx.employerUser.findMany({
      where: {
        role: "EMPLOYER_DER",
        employer: {
          activePoolId: input.pool.id,
          status: "ACTIVE"
        }
      },
      select: {
        employerId: true,
        email: true
      }
    });
  } else if (input.pool.employerId) {
    derUsers = await tx.employerUser.findMany({
      where: {
        role: "EMPLOYER_DER",
        employerId: input.pool.employerId
      },
      select: {
        employerId: true,
        email: true
      }
    });
  }

  const notices = buildNotices({
    pool: input.pool,
    year: input.year,
    quarter: input.quarter,
    eligibleDrivers,
    selectedDrivers: selection.selectedDrivers,
    derUsers
  });

  return {
    poolId: input.pool.id,
    randomPeriodId: period.id,
    employerId: employerScope,
    eventId: event.id,
    created: true,
    dryRun: false,
    eligibleCount: eligibleDrivers.length,
    selectedCountDrug: selection.selectedDrugIds.length,
    selectedCountAlcohol: selection.selectedAlcoholIds.length,
    eligibleHash,
    selectedHashDrug,
    selectedHashAlcohol,
    randomHmac,
    selectionLocked: event.selectionLocked,
    selectedDrivers: selection.selectedDrivers,
    notices
  };
}

async function sendCommitNotices(result: PoolRunResult, requestedByUserId?: string | null) {
  for (const notice of result.notices) {
    const emailResult =
      notice.kind === "selected"
        ? await sendRandomSelectionNotice({
            to: notice.to,
            year: notice.year,
            quarter: notice.quarter,
            selectedDrivers: notice.selectedDrivers
          })
        : await sendRandomNoSelectionNotice({
            to: notice.to,
            year: notice.year,
            quarter: notice.quarter,
            poolSize: notice.poolSize
          });

    if (result.eventId) {
      await prisma.auditLog.create({
        data: {
          userId: requestedByUserId || null,
          employerId: notice.employerId,
          action: "SEND_RANDOM_EMAIL",
          entityType: "RandomSelectionEvent",
          entityId: result.eventId,
          metadata: {
            kind: notice.kind,
            to: notice.to,
            messageId: emailResult.messageId
          }
        }
      });
    }
  }
}

export async function runRandomSelections(options: RunRandomOptions = {}) {
  const nowQuarter = resolveQuarter(new Date());
  const year = options.year || nowQuarter.year;
  const quarter = options.quarter || nowQuarter.quarter;
  const commit = options.commit === true;
  const dryRun = options.dryRun === true || !commit;

  const pools = await prisma.$transaction((tx) =>
    resolvePoolsForRun(tx, {
      employerId: options.employerId,
      force: options.force === true
    })
  );
  const results: PoolRunResult[] = [];

  for (const pool of pools) {
    const result = await prisma.$transaction((tx) =>
      runForPool(tx, {
        pool,
        year,
        quarter,
        commit,
        dryRun,
        force: options.force === true,
        forceEmployerId: options.force === true ? options.employerId : undefined,
        overrideReason: options.overrideReason,
        requestedByUserId: options.requestedByUserId || null
      })
    );
    results.push(result);

    if (commit && result.created) {
      await sendCommitNotices(result, options.requestedByUserId || null);
    }
  }

  return {
    year,
    quarter,
    commit,
    dryRun,
    results
  };
}

export async function sendQuarterEndRosterReviewReminders(input?: { year?: number; quarter?: number; requestedByUserId?: string | null }) {
  const nowQuarter = resolveQuarter(new Date());
  const year = input?.year || nowQuarter.year;
  const quarter = input?.quarter || nowQuarter.quarter;

  const users = await prisma.employerUser.findMany({
    where: {
      role: "EMPLOYER_DER",
      employer: {
        status: "ACTIVE"
      }
    },
    select: {
      id: true,
      employerId: true,
      email: true
    }
  });

  const sent = [];
  for (const user of users) {
    const message = await sendQuarterEndRosterReviewEmail({
      to: user.email,
      year,
      quarter
    });
    sent.push({ userId: user.id, employerId: user.employerId, messageId: message.messageId });
    await prisma.auditLog.create({
      data: {
        userId: input?.requestedByUserId || null,
        employerId: user.employerId,
        action: "SEND_ROSTER_REVIEW_EMAIL",
        entityType: "Employer",
        entityId: user.employerId || "unknown",
        metadata: {
          to: user.email,
          messageId: message.messageId,
          year,
          quarter
        }
      }
    });
  }

  return { year, quarter, sentCount: sent.length };
}
