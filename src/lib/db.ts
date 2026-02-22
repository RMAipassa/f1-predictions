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
      submitted_at text not null,
      primary key (league_id, user_id, season_year, round),
      foreign key (season_year, round) references races(season_year, round) on delete cascade
    );

    create table if not exists kv (
      k text primary key,
      v text not null
    );
  `);
}

export function db() {
  if (_db) return _db;
  const dbPath = path.join(getDataDir(), 'db.sqlite');
  _db = new Database(dbPath);
  migrate(_db);
  return _db;
}
