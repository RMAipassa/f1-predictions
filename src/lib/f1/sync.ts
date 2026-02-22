import { db } from '@/lib/db';
import {
  fetchSeasonCalendar,
  fetchSeasonConstructors,
  fetchSeasonDrivers,
  fetchQualifyingPoleDriverId,
  fetchRacePodiumDriverIds,
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
    `insert into races (season_year, round, name, circuit_name, quali_start, race_start)
     values (@season_year, @round, @name, @circuit_name, @quali_start, @race_start)
     on conflict (season_year, round) do update set
       name=excluded.name,
       circuit_name=excluded.circuit_name,
       quali_start=excluded.quali_start,
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
  const raceRows = db()
    .prepare('select round, race_start from races where season_year = ? order by round asc')
    .all(seasonYear) as any[];

  const existingByRound = new Map<number, any>();
  for (const r of db().prepare('select round, pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id from race_results where season_year = ?').all(seasonYear) as any[]) {
    existingByRound.set(Number(r.round), r);
  }

  const eligible = raceRows.filter((r) => r.race_start && new Date(String(r.race_start)).getTime() < Date.now());
  const toSync = eligible;

  const upsert = db().prepare(
    `insert into race_results (season_year, round, pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id, source, fetched_at, raw_json)
     values (@season_year, @round, @pole_driver_id, @p1_driver_id, @p2_driver_id, @p3_driver_id, @source, @fetched_at, @raw_json)
     on conflict (season_year, round) do update set
       pole_driver_id=excluded.pole_driver_id,
       p1_driver_id=excluded.p1_driver_id,
       p2_driver_id=excluded.p2_driver_id,
       p3_driver_id=excluded.p3_driver_id,
       source=excluded.source,
       fetched_at=excluded.fetched_at,
       raw_json=excluded.raw_json`
  );

  let synced = 0;
  let skipped = 0;
  let changed = 0;
  for (const r of toSync) {
    const round = Number(r.round);
    try {
      const [pole, podium] = await Promise.all([
        fetchQualifyingPoleDriverId(seasonYear, round),
        fetchRacePodiumDriverIds(seasonYear, round),
      ]);

      if (!podium.p1) {
        skipped++;
        continue;
      }

      const row = {
        season_year: seasonYear,
        round,
        pole_driver_id: pole,
        p1_driver_id: podium.p1,
        p2_driver_id: podium.p2,
        p3_driver_id: podium.p3,
        source: 'ergast-compatible',
        fetched_at: nowIso(),
        raw_json: JSON.stringify(podium.raw ?? {}),
      };

      const prev = existingByRound.get(round);
      const isChanged =
        !prev ||
        String(prev.pole_driver_id ?? '') !== String(row.pole_driver_id ?? '') ||
        String(prev.p1_driver_id ?? '') !== String(row.p1_driver_id ?? '') ||
        String(prev.p2_driver_id ?? '') !== String(row.p2_driver_id ?? '') ||
        String(prev.p3_driver_id ?? '') !== String(row.p3_driver_id ?? '');

      if (isChanged) {
        upsert.run(row);
        publishEvent('race_results_updated', { seasonYear, round, at: nowIso() });
        changed++;
      }
      synced++;
    } catch {
      skipped++;
    }
  }

  return { eligible: eligible.length, toSync: toSync.length, synced, skipped, changed };
}
