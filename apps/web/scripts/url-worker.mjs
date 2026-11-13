import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import { claimUrlJob, finishUrlJob } from "../server/db/processing-jobs.ts";
import { ExtractionError, extractHtml, fetchPublicHtml } from "../server/links/extract.ts";

const connectionString = process.env.URL_WORKER_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Set DATABASE_URL or URL_WORKER_DATABASE_URL for the worker");
const pool = new Pool({ connectionString, max: 2, connectionTimeoutMillis: 5_000, statement_timeout: 10_000 });
pool.on("error", () => console.error("LifeInbox worker lost an idle database connection"));
const shutdown = new AbortController();
process.once("SIGINT", () => shutdown.abort());
process.once("SIGTERM", () => shutdown.abort());
const once = process.argv.includes("--once");

async function processJob(job) {
  let result;
  try {
    result = extractHtml(await fetchPublicHtml(job.originalUrl));
  } catch (error) {
    result = error instanceof ExtractionError
      ? { code: error.code, transient: error.transient }
      : { code: "EXTRACTION_FAILED", transient: false };
  }
  if (await finishUrlJob(pool, job, result)) {
    console.info("URL extraction", "code" in result ? result.code : "SUCCEEDED");
  }
}

try {
  console.info("LifeInbox URL worker started");
  do {
    try {
      const job = await claimUrlJob(pool);
      if (job) {
        await processJob(job);
        continue;
      }
    } catch {
      console.error("LifeInbox worker database operation failed");
      if (once) process.exitCode = 1;
    }
    if (!once) await delay(2000, undefined, { signal: shutdown.signal }).catch(() => {});
  } while (!once && !shutdown.signal.aborted);
} finally {
  await pool.end();
}
