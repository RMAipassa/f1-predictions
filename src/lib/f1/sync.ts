import { db } from '@/lib/db';
import {
  fetchSeasonCalendar,
  fetchSeasonConstructors,
  fetchSeasonDrivers,
  fetchQualifyingPoleDriverId,
  fetchRacePodiumDriverIds,
  fetchSprintPodiumDriverIds,
  fetchSprintPoleDriverId,
} from '@/lib/f1/ergast';
import { publishEvent } from '@/lib/events';

function nowIso() {
  return new Date().toISOString();
}

export async function syncSeasonData(seasonYear: number) {
  db().prepare('insert or ignore into seasons (year) values (?)').run(seasonYear);

  const [races, drivers, constructors] = await Promise.all([
    fetchSeasonCalendar(seasonYear),
    fetchSeasonDrivers(seasonYear),
    fetchSeasonConstructors(seasonYear),
  ]);

  const upsertRace = db().prepare(
    `insert into races (season_year, round, name, circuit_name, quali_start, sprint_quali_start, sprint_race_start, race_start)
     values (@season_year, @round, @name, @circuit_name, @quali_start, @sprint_quali_start, @sprint_race_start, @race_start)
     on conflict (season_year, round) do update set
       name=excluded.name,
       circuit_name=excluded.circuit_name,
       quali_start=excluded.quali_start,
       sprint_quali_start=excluded.sprint_quali_start,
       sprint_race_start=excluded.sprint_race_start,
       race_start=excluded.race_start`
  );
  const upsertDriver = db().prepare(
    `insert into drivers (driver_id, code, given_name, family_name, permanent_number)
     values (@driver_id, @code, @given_name, @family_name, @permanent_number)
     on conflict (driver_id) do update set
       code=excluded.code,
       given_name=excluded.given_name,
       family_name=excluded.family_name,
       permanent_number=excluded.permanent_number`
  );
  const upsertConstructor = db().prepare(
    `insert into constructors (constructor_id, name)
     values (@constructor_id, @name)
     on conflict (constructor_id) do update set name=excluded.name`
  );

  const tx = db().transaction(() => {
    for (const r of races) upsertRace.run(r);
    for (const d of drivers) upsertDriver.run(d);
    for (const c of constructors) upsertConstructor.run(c);
  });
  tx();

  publishEvent('season_data_updated', { seasonYear, at: nowIso() });

  return { races: races.length, drivers: drivers.length, constructors: constructors.length };
}

export async function syncCompletedRaceResults(seasonYear: number) {
  const nowTs = Date.now();
  const hasStarted = (value: unknown) => {
    if (!value) return false;
    const ts = new Date(String(value)).getTime();
    return Number.isFinite(ts) && ts < nowTs;
  };

  const raceRows = db()
    .prepare(
      'select round, quali_start, sprint_quali_start, sprint_race_start, race_start from races where season_year = ? order by round asc'
    )
    .all(seasonYear) as any[];

  const existingByRound = new Map<number, any>();
  for (const r of db()
    .prepare(
      'select round, pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id, sprint_pole_driver_id, sprint_p1_driver_id, sprint_p2_driver_id, sprint_p3_driver_id from race_results where season_year = ?'
    )
    .all(seasonYear) as any[]) {
    existingByRound.set(Number(r.round), r);
  }

  const eligible = raceRows.filter(
    (r) =>
      hasStarted(r.quali_start) ||
      hasStarted(r.sprint_quali_start) ||
      hasStarted(r.sprint_race_start) ||
      hasStarted(r.race_start)
  );
  const toSync = eligible;
  const eligibleRounds = toSync.map((r) => Number(r.round));

  const upsert = db().prepare(
    `insert into race_results (
       season_year, round,
       pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id,
       sprint_pole_driver_id, sprint_p1_driver_id, sprint_p2_driver_id, sprint_p3_driver_id,
       source, fetched_at, raw_json
     )
     values (
       @season_year, @round,
       @pole_driver_id, @p1_driver_id, @p2_driver_id, @p3_driver_id,
       @sprint_pole_driver_id, @sprint_p1_driver_id, @sprint_p2_driver_id, @sprint_p3_driver_id,
       @source, @fetched_at, @raw_json
     )
     on conflict (season_year, round) do update set
       pole_driver_id=excluded.pole_driver_id,
       p1_driver_id=excluded.p1_driver_id,
       p2_driver_id=excluded.p2_driver_id,
       p3_driver_id=excluded.p3_driver_id,
       sprint_pole_driver_id=excluded.sprint_pole_driver_id,
       sprint_p1_driver_id=excluded.sprint_p1_driver_id,
       sprint_p2_driver_id=excluded.sprint_p2_driver_id,
       sprint_p3_driver_id=excluded.sprint_p3_driver_id,
       source=excluded.source,
       fetched_at=excluded.fetched_at,
       raw_json=excluded.raw_json`
  );

  let synced = 0;
  let skipped = 0;
  let changed = 0;
  const skippedDetails: Array<{ round: number; reason: 'no_data' | 'fetch_error' }> = [];
  for (const r of toSync) {
    const round = Number(r.round);
    try {
      const prev = existingByRound.get(round);

      const racePoleReady = hasStarted(r.quali_start) || hasStarted(r.race_start);
      const racePodiumReady = hasStarted(r.race_start);
      const sprintPoleReady = hasStarted(r.sprint_quali_start) || hasStarted(r.sprint_race_start) || hasStarted(r.race_start);
      const sprintPodiumReady = hasStarted(r.sprint_race_start) || hasStarted(r.race_start);

      let pole: string | null = null;
      let racePodium: { p1: string | null; p2: string | null; p3: string | null; raw: unknown } = {
        p1: null,
        p2: null,
        p3: null,
        raw: null,
      };
      let sprintPole: string | null = null;
      let sprintPodium: { p1: string | null; p2: string | null; p3: string | null; raw: unknown } = {
        p1: null,
        p2: null,
        p3: null,
        raw: null,
      };

      if (racePoleReady) {
        try {
          pole = await fetchQualifyingPoleDriverId(seasonYear, round);
        } catch {
          // ignore partial fetch errors
        }
      }

      if (racePodiumReady) {
        try {
          racePodium = await fetchRacePodiumDriverIds(seasonYear, round);
        } catch {
          // ignore partial fetch errors
        }
      }

      if (sprintPoleReady) {
        try {
          sprintPole = await fetchSprintPoleDriverId(seasonYear, round);
        } catch {
          // ignore partial fetch errors
        }
      }

      if (sprintPodiumReady) {
        try {
          sprintPodium = await fetchSprintPodiumDriverIds(seasonYear, round);
        } catch {
          // ignore partial fetch errors
        }
      }

      const row = {
        season_year: seasonYear,
        round,
        pole_driver_id: pole ?? (prev?.pole_driver_id ? String(prev.pole_driver_id) : null),
        p1_driver_id: racePodium.p1 ?? (prev?.p1_driver_id ? String(prev.p1_driver_id) : null),
        p2_driver_id: racePodium.p2 ?? (prev?.p2_driver_id ? String(prev.p2_driver_id) : null),
        p3_driver_id: racePodium.p3 ?? (prev?.p3_driver_id ? String(prev.p3_driver_id) : null),
        sprint_pole_driver_id: sprintPole ?? (prev?.sprint_pole_driver_id ? String(prev.sprint_pole_driver_id) : null),
        sprint_p1_driver_id: sprintPodium.p1 ?? (prev?.sprint_p1_driver_id ? String(prev.sprint_p1_driver_id) : null),
        sprint_p2_driver_id: sprintPodium.p2 ?? (prev?.sprint_p2_driver_id ? String(prev.sprint_p2_driver_id) : null),
        sprint_p3_driver_id: sprintPodium.p3 ?? (prev?.sprint_p3_driver_id ? String(prev.sprint_p3_driver_id) : null),
        source: 'ergast-compatible',
        fetched_at: nowIso(),
        raw_json: JSON.stringify({ race: racePodium.raw ?? null, sprint: sprintPodium.raw ?? null }),
      };

      const hasAnyData =
        row.pole_driver_id ||
        row.p1_driver_id ||
        row.p2_driver_id ||
        row.p3_driver_id ||
        row.sprint_pole_driver_id ||
        row.sprint_p1_driver_id ||
        row.sprint_p2_driver_id ||
        row.sprint_p3_driver_id;

      if (!hasAnyData) {
        skipped++;
        skippedDetails.push({ round, reason: 'no_data' });
        continue;
      }

      const isChanged =
        !prev ||
        String(prev.pole_driver_id ?? '') !== String(row.pole_driver_id ?? '') ||
        String(prev.p1_driver_id ?? '') !== String(row.p1_driver_id ?? '') ||
        String(prev.p2_driver_id ?? '') !== String(row.p2_driver_id ?? '') ||
        String(prev.p3_driver_id ?? '') !== String(row.p3_driver_id ?? '') ||
        String(prev.sprint_pole_driver_id ?? '') !== String(row.sprint_pole_driver_id ?? '') ||
        String(prev.sprint_p1_driver_id ?? '') !== String(row.sprint_p1_driver_id ?? '') ||
        String(prev.sprint_p2_driver_id ?? '') !== String(row.sprint_p2_driver_id ?? '') ||
        String(prev.sprint_p3_driver_id ?? '') !== String(row.sprint_p3_driver_id ?? '');

      if (isChanged) {
        upsert.run(row);
        publishEvent('race_results_updated', { seasonYear, round, at: nowIso() });
        changed++;
      }
      synced++;
    } catch {
      skipped++;
      skippedDetails.push({ round, reason: 'fetch_error' });
    }
  }

  return { eligible: eligible.length, toSync: toSync.length, synced, skipped, changed, eligibleRounds, skippedDetails };
}
