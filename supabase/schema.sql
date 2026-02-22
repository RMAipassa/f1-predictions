-- Minimal schema for F1 predictions (Supabase/Postgres)

create extension if not exists pgcrypto;

-- 1) Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- 2) Leagues + membership
create table if not exists public.leagues (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  owner_id uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.league_members (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (league_id, user_id)
);

alter table public.leagues enable row level security;
alter table public.league_members enable row level security;

create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.league_members lm
    where lm.league_id = p_league_id
      and lm.user_id = auth.uid()
  );
$$;

revoke all on function public.is_league_member(uuid) from public;
grant execute on function public.is_league_member(uuid) to authenticated;

create policy "leagues_select_if_member" on public.leagues
  for select to authenticated
  using (public.is_league_member(id));

create policy "league_members_select_if_member" on public.league_members
  for select to authenticated
  using (public.is_league_member(league_id));

-- 3) Reference data (public read)
create table if not exists public.seasons (
  year int primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.races (
  season_year int not null references public.seasons (year) on delete cascade,
  round int not null,
  name text not null,
  circuit_name text,
  race_start timestamptz,
  created_at timestamptz not null default now(),
  primary key (season_year, round)
);

create table if not exists public.drivers (
  driver_id text primary key,
  code text,
  given_name text,
  family_name text,
  permanent_number text,
  created_at timestamptz not null default now()
);

create table if not exists public.constructors (
  constructor_id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.race_results (
  season_year int not null,
  round int not null,
  pole_driver_id text,
  p1_driver_id text,
  p2_driver_id text,
  p3_driver_id text,
  source text not null,
  fetched_at timestamptz not null default now(),
  raw jsonb not null,
  primary key (season_year, round)
);

-- 4) Predictions (RLS protected)
create table if not exists public.season_predictions (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  season_year int not null references public.seasons (year) on delete cascade,
  -- wdc: { p1: driver_id, ..., p22: driver_id }
  wdc jsonb not null default '{}'::jsonb,
  -- wcc: { p1: constructor_id, ..., p11: constructor_id }
  wcc jsonb not null default '{}'::jsonb,
  -- random: { r1: "text", r2: "text", r3: "text", r4: "text", r5: "text" }
  random jsonb not null default '{}'::jsonb,
  submitted_at timestamptz not null default now(),
  primary key (league_id, user_id, season_year)
);

create table if not exists public.random_prediction_reviews (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  season_year int not null references public.seasons (year) on delete cascade,
  idx smallint not null check (idx between 1 and 5),
  is_correct boolean,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  primary key (league_id, user_id, season_year, idx)
);

create table if not exists public.race_predictions (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  season_year int not null,
  round int not null,
  pole_driver_id text,
  p1_driver_id text,
  p2_driver_id text,
  p3_driver_id text,
  submitted_at timestamptz not null default now(),
  primary key (league_id, user_id, season_year, round),
  foreign key (season_year, round) references public.races (season_year, round) on delete cascade
);

alter table public.season_predictions enable row level security;
alter table public.race_predictions enable row level security;
alter table public.random_prediction_reviews enable row level security;

create policy "season_predictions_select_if_member" on public.season_predictions
  for select to authenticated
  using (public.is_league_member(league_id));

create policy "season_predictions_insert_own" on public.season_predictions
  for insert to authenticated
  with check (public.is_league_member(league_id) and user_id = auth.uid());

create policy "season_predictions_update_own" on public.season_predictions
  for update to authenticated
  using (public.is_league_member(league_id) and user_id = auth.uid())
  with check (public.is_league_member(league_id) and user_id = auth.uid());

create policy "race_predictions_rw_if_member" on public.race_predictions
  for all to authenticated
  using (public.is_league_member(league_id) and user_id = auth.uid())
  with check (public.is_league_member(league_id) and user_id = auth.uid());

create policy "random_reviews_select_if_member" on public.random_prediction_reviews
  for select to authenticated
  using (public.is_league_member(league_id));

-- Only league owner can write reviews.
create or replace function public.is_league_owner(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.league_members lm
    where lm.league_id = p_league_id
      and lm.user_id = auth.uid()
      and lm.role = 'owner'
  );
$$;

revoke all on function public.is_league_owner(uuid) from public;
grant execute on function public.is_league_owner(uuid) to authenticated;

create policy "random_reviews_write_owner" on public.random_prediction_reviews
  for insert to authenticated
  with check (public.is_league_owner(league_id));

create policy "random_reviews_update_owner" on public.random_prediction_reviews
  for update to authenticated
  using (public.is_league_owner(league_id))
  with check (public.is_league_owner(league_id));

-- 5) RPC helpers (create/join leagues)
create or replace function public.generate_league_code()
returns text
language plpgsql
security definer
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out_code text := '';
  i int;
begin
  for i in 1..8 loop
    out_code := out_code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return out_code;
end;
$$;

revoke all on function public.generate_league_code() from public;

create or replace function public.create_league(p_name text)
returns public.leagues
language plpgsql
security definer
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_league public.leagues;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.profiles (id)
  values (v_user)
  on conflict (id) do nothing;

  loop
    v_code := public.generate_league_code();
    exit when not exists(select 1 from public.leagues l where l.code = v_code);
  end loop;

  insert into public.leagues (code, name, owner_id)
  values (v_code, p_name, v_user)
  returning * into v_league;

  insert into public.league_members (league_id, user_id, role)
  values (v_league.id, v_user, 'owner');

  return v_league;
end;
$$;

revoke all on function public.create_league(text) from public;
grant execute on function public.create_league(text) to authenticated;

create or replace function public.join_league(p_code text)
returns public.leagues
language plpgsql
security definer
as $$
declare
  v_user uuid := auth.uid();
  v_league public.leagues;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  insert into public.profiles (id)
  values (v_user)
  on conflict (id) do nothing;

  select * into v_league
  from public.leagues l
  where l.code = upper(p_code);

  if v_league.id is null then
    raise exception 'league_not_found';
  end if;

  insert into public.league_members (league_id, user_id, role)
  values (v_league.id, v_user, 'member')
  on conflict (league_id, user_id) do nothing;

  return v_league;
end;
$$;

revoke all on function public.join_league(text) from public;
grant execute on function public.join_league(text) to authenticated;
