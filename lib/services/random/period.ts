import { Prisma } from "@prisma/client";

export function resolveQuarter(inputDate = new Date()) {
  const year = inputDate.getUTCFullYear();
  const month = inputDate.getUTCMonth();
  const quarter = Math.floor(month / 3) + 1;
  return { year, quarter };
}

export function quarterRange(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3;
  const endMonth = startMonth + 2;
  const startDate = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, endMonth + 1, 0, 23, 59, 59, 999));
  return { startDate, endDate };
}

type Tx = Prisma.TransactionClient;

export async function getOrCreateRandomPeriod(tx: Tx, year: number, quarter: number) {
  const existing = await tx.randomPeriod.findUnique({
    where: {
      year_periodType_periodNumber: {
        year,
        periodType: "QUARTER",
        periodNumber: quarter
      }
    }
  });
  if (existing) return existing;

  const range = quarterRange(year, quarter);
  return tx.randomPeriod.create({
    data: {
      year,
      periodType: "QUARTER",
      periodNumber: quarter,
      startDate: range.startDate,
      endDate: range.endDate
    }
  });
}
