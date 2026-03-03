import { DotAgency, Prisma, TestType } from "@prisma/client";
import { DEFAULT_DOT_RATES } from "@/lib/services/random/constants";
import { prisma } from "@/lib/db/prisma";

type Tx = Prisma.TransactionClient;

function toYearRange(year: number) {
  return {
    gte: new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0)),
    lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999))
  };
}

export async function getOrCreateDotRateConfig(tx: Tx, year: number, agency: DotAgency = "FMCSA") {
  const existing = await tx.dotRateConfig.findUnique({
    where: {
      agency_year: {
        agency,
        year
      }
    }
  });
  if (existing) return existing;
  const defaults = DEFAULT_DOT_RATES[agency];
  return tx.dotRateConfig.create({
    data: {
      agency,
      year,
      drugRate: defaults.drugRate,
      alcoholRate: defaults.alcoholRate
    }
  });
}

async function countCompletedTests(
  tx: Tx,
  input: { poolId: string; year: number; employerId?: string | null; includes: "DRUG" | "ALCOHOL" }
) {
  const allowedTypes: TestType[] =
    input.includes === "DRUG" ? ["DRUG", "BOTH"] : ["ALCOHOL", "BOTH"];

  return tx.testRequest.count({
    where: {
      reason: "RANDOM",
      testType: { in: allowedTypes },
      collectedAt: toYearRange(input.year),
      randomSelected: {
        selectionEvent: {
          poolId: input.poolId
        }
      },
      ...(input.employerId ? { employerId: input.employerId } : {})
    }
  });
}

async function recalculateComplianceScope(
  tx: Tx,
  input: {
    poolId: string;
    year: number;
    employerId: string | null;
  }
) {
  const rateConfig = await getOrCreateDotRateConfig(tx, input.year, "FMCSA");

  const snapshots = await tx.poolSnapshot.findMany({
    where: {
      poolId: input.poolId,
      employerId: input.employerId,
      randomPeriod: {
        year: input.year
      }
    },
    select: { coveredDriverCount: true }
  });

  const avgCoveredDrivers =
    snapshots.length === 0
      ? 0
      : snapshots.reduce((sum, row) => sum + row.coveredDriverCount, 0) / snapshots.length;

  const requiredDrug = Math.ceil(avgCoveredDrivers * rateConfig.drugRate);
  const requiredAlcohol = Math.ceil(avgCoveredDrivers * rateConfig.alcoholRate);

  const [completedDrug, completedAlcohol] = await Promise.all([
    countCompletedTests(tx, {
      poolId: input.poolId,
      year: input.year,
      employerId: input.employerId,
      includes: "DRUG"
    }),
    countCompletedTests(tx, {
      poolId: input.poolId,
      year: input.year,
      employerId: input.employerId,
      includes: "ALCOHOL"
    })
  ]);

  if (input.employerId) {
    return tx.complianceYearSummary.upsert({
      where: {
        poolId_employerId_year: {
          poolId: input.poolId,
          employerId: input.employerId,
          year: input.year
        }
      },
      create: {
        poolId: input.poolId,
        employerId: input.employerId,
        year: input.year,
        avgCoveredDrivers,
        requiredDrug,
        completedDrug,
        requiredAlcohol,
        completedAlcohol,
        lastRecalcAt: new Date()
      },
      update: {
        avgCoveredDrivers,
        requiredDrug,
        completedDrug,
        requiredAlcohol,
        completedAlcohol,
        lastRecalcAt: new Date()
      }
    });
  }

  const existingMaster = await tx.complianceYearSummary.findFirst({
    where: {
      poolId: input.poolId,
      year: input.year,
      employerId: null
    },
    select: { id: true }
  });

  if (existingMaster) {
    return tx.complianceYearSummary.update({
      where: { id: existingMaster.id },
      data: {
        avgCoveredDrivers,
        requiredDrug,
        completedDrug,
        requiredAlcohol,
        completedAlcohol,
        lastRecalcAt: new Date()
      }
    });
  }

  return tx.complianceYearSummary.create({
    data: {
      poolId: input.poolId,
      employerId: null,
      year: input.year,
      avgCoveredDrivers,
      requiredDrug,
      completedDrug,
      requiredAlcohol,
      completedAlcohol,
      lastRecalcAt: new Date()
    }
  });
}

export async function recalculateComplianceForPoolYear(tx: Tx, input: { poolId: string; year: number }) {
  const pool = await tx.pool.findUnique({
    where: { id: input.poolId },
    include: {
      activeEmployers: {
        where: { status: "ACTIVE" },
        select: { id: true }
      }
    }
  });
  if (!pool) throw new Error("POOL_NOT_FOUND");

  const scopes: Array<{ employerId: string | null }> = [];
  if (pool.type === "MASTER") {
    scopes.push({ employerId: null });
    for (const employer of pool.activeEmployers) {
      scopes.push({ employerId: employer.id });
    }
  } else {
    scopes.push({ employerId: pool.employerId || null });
  }

  const results = [];
  for (const scope of scopes) {
    const summary = await recalculateComplianceScope(tx, {
      poolId: input.poolId,
      year: input.year,
      employerId: scope.employerId
    });
    results.push(summary);
  }

  return results;
}

export async function markRandomTestRequestCollected(input: {
  testRequestId: string;
  collectedAt: Date;
  completedAt?: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.testRequest.findUnique({
      where: { id: input.testRequestId },
      include: {
        randomSelected: {
          include: {
            selectionEvent: {
              select: { poolId: true }
            }
          }
        }
      }
    });
    if (!existing) throw new Error("TEST_REQUEST_NOT_FOUND");

    const updated = await tx.testRequest.update({
      where: { id: existing.id },
      data: {
        collectedAt: input.collectedAt,
        completedAt: input.completedAt || input.collectedAt,
        status: "COMPLETED"
      }
    });

    if (existing.randomSelected) {
      await tx.randomSelectedDriver.update({
        where: { id: existing.randomSelected.id },
        data: {
          status: "COMPLETED"
        }
      });
      await recalculateComplianceForPoolYear(tx, {
        poolId: existing.randomSelected.selectionEvent.poolId,
        year: input.collectedAt.getUTCFullYear()
      });
    }

    return updated;
  });
}

export async function getRateConfigForYear(year: number, agency: DotAgency = "FMCSA") {
  return prisma.$transaction((tx) => getOrCreateDotRateConfig(tx, year, agency));
}

export async function upsertRateConfig(input: {
  year: number;
  agency?: DotAgency;
  drugRate: number;
  alcoholRate: number;
}) {
  const agency = input.agency || "FMCSA";
  return prisma.dotRateConfig.upsert({
    where: {
      agency_year: {
        agency,
        year: input.year
      }
    },
    create: {
      agency,
      year: input.year,
      drugRate: input.drugRate,
      alcoholRate: input.alcoholRate
    },
    update: {
      drugRate: input.drugRate,
      alcoholRate: input.alcoholRate
    }
  });
}

export async function listComplianceSummaries(input: { year: number; employerId?: string }) {
  if (input.employerId) {
    const employer = await prisma.employer.findUnique({
      where: { id: input.employerId },
      select: { id: true, activePoolId: true }
    });
    if (!employer?.activePoolId) return [];
    return prisma.complianceYearSummary.findMany({
      where: {
        year: input.year,
        poolId: employer.activePoolId,
        OR: [{ employerId: input.employerId }, { employerId: null }]
      },
      include: {
        pool: true,
        employer: true
      },
      orderBy: [{ employerId: "asc" }]
    });
  }

  return prisma.complianceYearSummary.findMany({
    where: {
      year: input.year
    },
    include: {
      pool: true,
      employer: true
    },
    orderBy: [{ poolId: "asc" }, { employerId: "asc" }]
  });
}
