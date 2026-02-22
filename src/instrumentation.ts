import { syncCompletedRaceResults, syncSeasonData } from '@/lib/f1/sync';
import { maybeStartCloudflared } from '@/lib/tunnel';

declare global {
  // eslint-disable-next-line no-var
  var __F1P_JOBS_STARTED__: boolean | undefined;
}

async function tick() {
  const seasonYear = new Date().getUTCFullYear();
  await syncSeasonData(seasonYear);
  await syncCompletedRaceResults(seasonYear);
}

export async function register() {
  if (process.env.ENABLE_BACKGROUND_JOBS !== '1') return;
  if (globalThis.__F1P_JOBS_STARTED__) return;
  globalThis.__F1P_JOBS_STARTED__ = true;

  maybeStartCloudflared();

  // Run once at startup, then poll.
  tick().catch(() => {});

  const intervalMs = 15 * 60 * 1000;
  setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);
}
