import { syncCompletedRaceResults, syncSeasonData } from '@/lib/f1/sync';
import { maybeStartCloudflared } from '@/lib/tunnel';
import { db } from '@/lib/db';

declare global {
  // eslint-disable-next-line no-var
  var __F1P_JOBS_STARTED__: boolean | undefined;
}

async function tick() {
  const seasonYear = new Date().getUTCFullYear();
  await syncSeasonData(seasonYear);
  await syncCompletedRaceResults(seasonYear);
}

function chooseIntervalMs() {
  const seasonYear = new Date().getUTCFullYear();
  const now = Date.now();
  try {
    const nextRace = db()
      .prepare('select race_start from races where season_year = ? and race_start is not null and race_start > ? order by race_start asc limit 1')
      .get(seasonYear, new Date(now).toISOString()) as any;
    if (nextRace?.race_start) {
      const diff = new Date(String(nextRace.race_start)).getTime() - now;
      if (diff < 6 * 60 * 60 * 1000) return 5 * 60 * 1000;
    }

    const pending = db()
      .prepare(
        `select 1
         from races r
         left join race_results rr on rr.season_year = r.season_year and rr.round = r.round
         where r.season_year = ?
           and r.race_start is not null
           and r.race_start < ?
           and rr.round is null
         limit 1`
      )
      .get(seasonYear, new Date(now).toISOString());
    if (pending) return 10 * 60 * 1000;
  } catch {
    // ignore
  }

  return 60 * 60 * 1000;
}

export async function register() {
  if (process.env.ENABLE_BACKGROUND_JOBS !== '1') return;
  if (globalThis.__F1P_JOBS_STARTED__) return;
  globalThis.__F1P_JOBS_STARTED__ = true;

  maybeStartCloudflared();

  // Run once at startup, then poll.
  tick().catch(() => {});

  const loop = async () => {
    await tick().catch(() => {});
    setTimeout(loop, chooseIntervalMs());
  };
  setTimeout(loop, chooseIntervalMs());
}
