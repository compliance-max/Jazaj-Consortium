import crypto from "crypto";
import { RANDOM_ALGORITHM_VERSION } from "@/lib/services/random/constants";

export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function sortedIdsHash(ids: string[]) {
  return sha256([...ids].sort().join(","));
}

export function buildRandomHmac(input: {
  poolId: string;
  randomPeriodId: string;
  runAtIso: string;
  eligibleHash: string;
  selectedHashDrug: string;
  selectedHashAlcohol: string;
  algorithmVersion?: string;
}) {
  const algorithmVersion = input.algorithmVersion || RANDOM_ALGORITHM_VERSION;
  const secret = process.env.RANDOM_PROOF_SECRET || "dev-random-proof-secret";
  const payload = [
    input.poolId,
    input.randomPeriodId,
    input.runAtIso,
    input.eligibleHash,
    input.selectedHashDrug,
    input.selectedHashAlcohol,
    algorithmVersion
  ].join("|");

  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function secureShuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
