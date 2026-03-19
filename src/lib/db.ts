import path from 'node:path';
import Database from 'better-sqlite3';
import { getDataDir } from '@/lib/paths';

let _db: Database.Database | null = null;

function migrate(db: Database.Database) {
  db.exec(`
    pragma journal_mode = wal;
    pragma foreign_keys = on;

    create table if not exists users (
      id text primary key,
      nickname text not null unique,
      password_hash text not null,
      created_at text not null
    );

    create table if not exists sessions (
      token text primary key,
      user_id text not null references users(id) on delete cascade,
      expires_at text not null
    );

    create table if not exists leagues (
      id text primary key,
      code text not null unique,
      name text not null,
      owner_id text not null references users(id) on delete restrict,
      created_at text not null
    );

    create table if not exists league_members (
      league_id text not null references leagues(id) on delete cascade,
      user_id text not null references users(id) on delete cascade,
      role text not null check (role in ('owner','member')),
      joined_at text not null,
      primary key (league_id, user_id)
    );

    create table if not exists league_join_requests (
      league_id text not null references leagues(id) on delete cascade,
      user_id text not null references users(id) on delete cascade,
      status text not null check (status in ('pending','approved','rejected')),
      created_at text not null,
      decided_by text references users(id) on delete set null,
      decided_at text,
      primary key (league_id, user_id)
    );

    create table if not exists seasons (
      year integer primary key
    );

    create table if not exists races (
      season_year integer not null references seasons(year) on delete cascade,
      round integer not null,
      name text not null,
      circuit_name text,
      quali_start text,
      sprint_quali_start text,
      sprint_race_start text,
      race_start text,
      primary key (season_year, round)
    );

    create table if not exists drivers (
      driver_id text primary key,
      code text,
      given_name text,
      family_name text,
      permanent_number text
    );

    create table if not exists constructors (
      constructor_id text primary key,
      name text not null
    );

    create table if not exists race_results (
      season_year integer not null,
      round integer not null,
      pole_driver_id text,
      p1_driver_id text,
      p2_driver_id text,
      p3_driver_id text,
      sprint_pole_driver_id text,
      sprint_p1_driver_id text,
      sprint_p2_driver_id text,
      sprint_p3_driver_id text,
      source text not null,
      fetched_at text not null,
      raw_json text not null,
      primary key (season_year, round),
      foreign key (season_year, round) references races(season_year, round) on delete cascade
    );

    create table if not exists season_predictions (
      league_id text not null references leagues(id) on delete cascade,
      user_id text not null references users(id) on delete cascade,
      season_year integer not null references seasons(year) on delete cascade,
      wdc_json text not null,
      wcc_json text not null,
      random_json text not null,
      submitted_at text not null,
      invalidated_at text,
      invalidated_by text references users(id) on delete set null,
      primary key (league_id, user_id, season_year)
    );

    create table if not exists random_prediction_reviews (
      league_id text not null references leagues(id) on delete cascade,
      user_id text not null references users(id) on delete cascade,
      season_year integer not null references seasons(year) on delete cascade,
      idx integer not null check (idx between 1 and 5),
      is_correct integer,
      reviewed_by text references users(id) on delete set null,
      reviewed_at text,
      primary key (league_id, user_id, season_year, idx)
    );

    create table if not exists race_predictions (
      league_id text not null references leagues(id) on delete cascade,
      user_id text not null references users(id) on delete cascade,
      season_year integer not null,
      round integer not null,
      pole_driver_id text,
      p1_driver_id text,
      p2_driver_id text,
      p3_driver_id text,
      sprint_pole_driver_id text,
      sprint_p1_driver_id text,
      sprint_p2_driver_id text,
      sprint_p3_driver_id text,
      submitted_at text not null,
      primary key (league_id, user_id, season_year, round),
      foreign key (season_year, round) references races(season_year, round) on delete cascade
    );

    create table if not exists prediction_unlock_overrides (
      league_id text not null references leagues(id) on delete cascade,
      season_year integer not null references seasons(year) on delete cascade,
      round integer not null,
      prediction_key text not null check (prediction_key in ('race_pole','race_podium','sprint_pole','sprint_podium')),
      is_enabled integer not null check (is_enabled in (0,1)),
      updated_by text references users(id) on delete set null,
      updated_at text not null,
      primary key (league_id, season_year, round, prediction_key),
      foreign key (season_year, round) references races(season_year, round) on delete cascade
    );

    create table if not exists kart_tracks (
      id text primary key,
      league_id text not null references leagues(id) on delete cascade,
      name text not null,
      location text,
      created_by text not null references users(id) on delete restrict,
      created_at text not null
    );

    create table if not exists kart_track_times (
      id text primary key,
      track_id text not null references kart_tracks(id) on delete cascade,
      user_id text not null references users(id) on delete cascade,
      session_label text,
      lap_ms integer not null check (lap_ms > 0),
      session_at text,
      note text,
      created_at text not null
    );

    create index if not exists idx_kart_tracks_league on kart_tracks(league_id);
    create index if not exists idx_kart_times_track on kart_track_times(track_id, lap_ms asc);
    create index if not exists idx_kart_times_user on kart_track_times(user_id, created_at desc);
    create unique index if not exists idx_kart_times_session_best on kart_track_times(track_id, user_id, session_label);

    create table if not exists kv (
      k text primary key,
      v text not null
    );
  `);

  // Lightweight column migrations for existing db.sqlite.
  try {
    const cols = new Set(
      (db.prepare("select name from pragma_table_info('races')").all() as any[]).map((r) => String(r.name))
    );
    if (!cols.has('quali_start')) db.prepare('alter table races add column quali_start text').run();
    if (!cols.has('sprint_quali_start')) db.prepare('alter table races add column sprint_quali_start text').run();
    if (!cols.has('sprint_race_start')) db.prepare('alter table races add column sprint_race_start text').run();
  } catch {
    // ignore
  }

  try {
    const cols = new Set(
      (db.prepare("select name from pragma_table_info('season_predictions')").all() as any[]).map((r) => String(r.name))
    );
    if (!cols.has('invalidated_at')) db.prepare('alter table season_predictions add column invalidated_at text').run();
    if (!cols.has('invalidated_by')) db.prepare('alter table season_predictions add column invalidated_by text').run();
  } catch {
    // ignore
  }

  try {
    const cols = new Set(
      (db.prepare("select name from pragma_table_info('race_predictions')").all() as any[]).map((r) => String(r.name))
    );
    if (!cols.has('sprint_pole_driver_id')) db.prepare('alter table race_predictions add column sprint_pole_driver_id text').run();
    if (!cols.has('sprint_p1_driver_id')) db.prepare('alter table race_predictions add column sprint_p1_driver_id text').run();
    if (!cols.has('sprint_p2_driver_id')) db.prepare('alter table race_predictions add column sprint_p2_driver_id text').run();
    if (!cols.has('sprint_p3_driver_id')) db.prepare('alter table race_predictions add column sprint_p3_driver_id text').run();
  } catch {
    // ignore
  }

  try {
    const cols = new Set(
      (db.prepare("select name from pragma_table_info('race_results')").all() as any[]).map((r) => String(r.name))
    );
    if (!cols.has('sprint_pole_driver_id')) db.prepare('alter table race_results add column sprint_pole_driver_id text').run();
    if (!cols.has('sprint_p1_driver_id')) db.prepare('alter table race_results add column sprint_p1_driver_id text').run();
    if (!cols.has('sprint_p2_driver_id')) db.prepare('alter table race_results add column sprint_p2_driver_id text').run();
    if (!cols.has('sprint_p3_driver_id')) db.prepare('alter table race_results add column sprint_p3_driver_id text').run();
  } catch {
    // ignore
  }

  try {
    const cols = new Set(
      (db.prepare("select name from pragma_table_info('kart_track_times')").all() as any[]).map((r) => String(r.name))
    );
    if (!cols.has('session_label')) db.prepare('alter table kart_track_times add column session_label text').run();
  } catch {
    // ignore
  }
}

export function db() {
  if (_db) return _db;
  const dbPath = path.join(getDataDir(), 'db.sqlite');
  _db = new Database(dbPath);
  migrate(_db);
  return _db;
}
