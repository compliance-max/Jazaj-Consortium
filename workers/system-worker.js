const { Queue, Worker } = require("bullmq");
const IORedis = require("ioredis");

function createRedisConnection() {
  if (process.env.REDIS_URL) {
    return new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return new IORedis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null
  });
}

async function callInternal(path, scope) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const token = process.env.INTERNAL_JOB_TOKEN || "";
  const response = await fetch(`${appUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-job-token": token,
      "x-internal-job-scope": scope
    }
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Internal job call failed (${response.status}): ${text}`);
  }
  return response.json();
}

async function main() {
  const connection = createRedisConnection();
  const queueName = "system-jobs";
  const queue = new Queue(queueName, { connection });

  await queue.add(
    "quarter_start_random_commit",
    {},
    {
      jobId: "quarter_start_random_commit",
      repeat: {
        pattern: "0 9 1 1,4,7,10 *",
        tz: "America/Detroit"
      },
      removeOnComplete: 20,
      removeOnFail: 20
    }
  );
  console.log("[worker] registered repeat job: quarter_start_random_commit");

  await queue.add(
    "quarter_end_roster_review",
    {},
    {
      jobId: "quarter_end_roster_review",
      repeat: {
        pattern: "0 9 25 3,6,9,12 *",
        tz: "America/Detroit"
      },
      removeOnComplete: 20,
      removeOnFail: 20
    }
  );
  console.log("[worker] registered repeat job: quarter_end_roster_review");

  await queue.add(
    "retention_candidates_scan",
    {},
    {
      jobId: "retention_candidates_scan",
      repeat: {
        pattern: "30 9 * * *",
        tz: "America/Detroit"
      },
      removeOnComplete: 20,
      removeOnFail: 20
    }
  );
  console.log("[worker] registered repeat job: retention_candidates_scan");

  const worker = new Worker(
    queueName,
    async (job) => {
      if (job.name === "quarter_start_random_commit") {
        return callInternal("/api/internal/jobs/run-random", "jobs:random_run");
      }
      if (job.name === "quarter_end_roster_review") {
        return callInternal("/api/internal/jobs/quarter-end-review", "jobs:quarter_review");
      }
      if (job.name === "retention_candidates_scan") {
        return callInternal("/api/internal/jobs/retention-candidates", "jobs:retention_scan");
      }
      throw new Error(`Unknown job name: ${job.name}`);
    },
    { connection }
  );

  worker.on("completed", (job) => {
    console.log("[worker] completed", job.name, job.id);
  });
  worker.on("failed", (job, error) => {
    console.error("[worker] failed", job?.name, job?.id, error?.message);
  });

  console.log("[worker] system worker started");
}

main().catch((error) => {
  console.error("[worker] fatal", error);
  process.exit(1);
});
