import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cron from 'node-cron';
import { loadModules } from '../utils/loadModules.js';
import { sweep } from '../services/sweeperService.js';

const APP_JOBS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'app');

/** Core job: the overdue sweeper, every 15 minutes and once at boot (Req 8.1). */
export const sweeperJob = {
  name: 'overdue-sweeper',
  schedule: '*/15 * * * *',
  runAtBoot: true,
  run: ({ registry, now }) => sweep(registry, now),
};

/**
 * Loads app jobs from src/jobs/app/*.js. Each default-exports
 * `{ name, schedule, run(ctx), runAtBoot? }` (Req 16.5).
 */
export async function loadJobs(dir = APP_JOBS_DIR) {
  const mods = await loadModules(dir);
  return mods.map(({ file, value }) => {
    if (!value?.name || typeof value.run !== 'function' || !cron.validate(value.schedule ?? '')) {
      throw new Error(`jobs/app/${file} must export { name, schedule (valid cron), run }`);
    }
    return value;
  });
}

async function runSafely(job, registry, log) {
  try {
    const result = await job.run({ registry, now: new Date() });
    log(`⏰ ${job.name}: ${JSON.stringify(result ?? 'ok')}`);
  } catch (err) {
    log(`✖ job ${job.name} failed: ${err.message}`);
  }
}

/**
 * Schedules the core sweeper plus app jobs. A failing job is logged and never crashes the server.
 * @returns {Promise<{ jobs: object[], stop: () => void }>}
 */
export async function startJobs({ registry, log = console.log } = {}) {
  const jobs = [sweeperJob, ...(await loadJobs())];
  const tasks = jobs.map((job) => cron.schedule(job.schedule, () => runSafely(job, registry, log)));
  for (const job of jobs) if (job.runAtBoot) await runSafely(job, registry, log);
  return { jobs, stop: () => tasks.forEach((t) => t.stop()) };
}
