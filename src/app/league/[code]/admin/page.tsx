import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getLeagueByCode } from '@/lib/league';
import { syncCompletedRaceResults, syncSeasonData } from '@/lib/f1/sync';
import { db } from '@/lib/db';
import { decideJoinRequest, deleteLeague } from '@/lib/leagues';
import ConfirmSubmitButton from '@/components/ConfirmSubmitButton';
import PendingSubmitButton from '@/components/PendingSubmitButton';

function parseObj(json: string) {
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function collectSeasonIssues(prefix: 'WDC' | 'WCC', slots: number, picks: Record<string, unknown>, allowed: Set<string>) {
  const issues: string[] = [];
  const seen = new Map<string, string>();

  for (let i = 1; i <= slots; i++) {
    const key = `p${i}`;
    const raw = picks[key];
    if (typeof raw !== 'string') continue;
    const value = raw.trim();
    if (!value) continue;

    if (!allowed.has(value)) {
      issues.push(`${prefix} ${key}: unknown id (${value})`);
      continue;
    }

    const prev = seen.get(value);
    if (prev) {
      issues.push(`${prefix} duplicate: ${prev} and ${key}`);
      continue;
    }
    seen.set(value, key);
  }

  return issues;
}

function collectRaceIssues(
  picks: {
    pole_driver_id: string | null;
    p1_driver_id: string | null;
    p2_driver_id: string | null;
    p3_driver_id: string | null;
    sprint_pole_driver_id: string | null;
    sprint_p1_driver_id: string | null;
    sprint_p2_driver_id: string | null;
    sprint_p3_driver_id: string | null;
  },
  allowed: Set<string>
) {
  const issues: string[] = [];

  const fields: Array<{ label: string; value: string | null }> = [
    { label: 'Pole', value: picks.pole_driver_id },
    { label: 'P1', value: picks.p1_driver_id },
    { label: 'P2', value: picks.p2_driver_id },
    { label: 'P3', value: picks.p3_driver_id },
    { label: 'Sprint Pole', value: picks.sprint_pole_driver_id },
    { label: 'Sprint P1', value: picks.sprint_p1_driver_id },
    { label: 'Sprint P2', value: picks.sprint_p2_driver_id },
    { label: 'Sprint P3', value: picks.sprint_p3_driver_id },
  ];

  for (const f of fields) {
    if (!f.value) continue;
    if (!allowed.has(f.value)) issues.push(`${f.label}: unknown id (${f.value})`);
  }

  const raceSlots = [
    { label: 'P1', value: picks.p1_driver_id },
    { label: 'P2', value: picks.p2_driver_id },
    { label: 'P3', value: picks.p3_driver_id },
  ].filter((x) => x.value);

  const seen = new Map<string, string>();
  for (const slot of raceSlots) {
    const v = String(slot.value);
    const prev = seen.get(v);
    if (prev) {
      issues.push(`Race duplicate: ${prev} and ${slot.label}`);
    } else {
      seen.set(v, slot.label);
    }
  }

  const sprintRaceSlots = [
    { label: 'Sprint P1', value: picks.sprint_p1_driver_id },
    { label: 'Sprint P2', value: picks.sprint_p2_driver_id },
    { label: 'Sprint P3', value: picks.sprint_p3_driver_id },
  ].filter((x) => x.value);

  const sprintSeen = new Map<string, string>();
  for (const slot of sprintRaceSlots) {
    const v = String(slot.value);
    const prev = sprintSeen.get(v);
    if (prev) {
      issues.push(`Sprint duplicate: ${prev} and ${slot.label}`);
    } else {
      sprintSeen.set(v, slot.label);
    }
  }

  return issues;
}

function scoreRacePoints(pred: any, result: any) {
  if (!pred || !result) return 0;
  let pts = 0;
  if (pred.pole_driver_id && result.pole_driver_id && pred.pole_driver_id === result.pole_driver_id) pts++;
  if (pred.p1_driver_id && result.p1_driver_id && pred.p1_driver_id === result.p1_driver_id) pts++;
  if (pred.p2_driver_id && result.p2_driver_id && pred.p2_driver_id === result.p2_driver_id) pts++;
  if (pred.p3_driver_id && result.p3_driver_id && pred.p3_driver_id === result.p3_driver_id) pts++;
  if (pred.sprint_pole_driver_id && result.sprint_pole_driver_id && pred.sprint_pole_driver_id === result.sprint_pole_driver_id) pts++;
  if (pred.sprint_p1_driver_id && result.sprint_p1_driver_id && pred.sprint_p1_driver_id === result.sprint_p1_driver_id) pts++;
  if (pred.sprint_p2_driver_id && result.sprint_p2_driver_id && pred.sprint_p2_driver_id === result.sprint_p2_driver_id) pts++;
  if (pred.sprint_p3_driver_id && result.sprint_p3_driver_id && pred.sprint_p3_driver_id === result.sprint_p3_driver_id) pts++;
  return pts;
}

export default async function LeagueAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{
    verify?: string;
    sync?: string;
    races?: string;
    drivers?: string;
    constructors?: string;
    eligible?: string;
    synced?: string;
    skipped?: string;
    changed?: string;
  }>;
}) {
  const p = await params;
  const sp = await searchParams;
  const { league, member, user } = await getLeagueByCode(p.code);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/league/${p.code}/admin`)}`);
  if (!league) return notFound();
  if (!member || member.role !== 'owner') return notFound();

  const seasonYear = new Date().getUTCFullYear();

  async function syncSeason() {
    'use server';
    const out = await syncSeasonData(seasonYear);
    redirect(
      `/league/${p.code}/admin?sync=season&races=${out.races}&drivers=${out.drivers}&constructors=${out.constructors}`
    );
  }

  async function syncResults() {
    'use server';

    const { league: freshLeague, member: freshMember, user: freshUser } = await getLeagueByCode(p.code);
    if (!freshLeague || !freshUser || !freshMember || freshMember.role !== 'owner') return;

    const beforeResults = db()
      .prepare(
        `select round,
                pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id,
                sprint_pole_driver_id, sprint_p1_driver_id, sprint_p2_driver_id, sprint_p3_driver_id
         from race_results
         where season_year = ?`
      )
      .all(seasonYear) as any[];
    const preds = db()
      .prepare(
        `select user_id, round,
                pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id,
                sprint_pole_driver_id, sprint_p1_driver_id, sprint_p2_driver_id, sprint_p3_driver_id
         from race_predictions
         where league_id = ? and season_year = ?`
      )
      .all(String(freshLeague.id), seasonYear) as any[];

    const beforeByRound = new Map<number, any>();
    for (const r of beforeResults ?? []) beforeByRound.set(Number(r.round), r);

    const out = await syncCompletedRaceResults(seasonYear);

    const afterResults = db()
      .prepare(
        `select round,
                pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id,
                sprint_pole_driver_id, sprint_p1_driver_id, sprint_p2_driver_id, sprint_p3_driver_id
         from race_results
         where season_year = ?`
      )
      .all(seasonYear) as any[];
    const afterByRound = new Map<number, any>();
    for (const r of afterResults ?? []) afterByRound.set(Number(r.round), r);

    const members = db()
      .prepare(
        `select lm.user_id, u.nickname
         from league_members lm
         join users u on u.id = lm.user_id
         where lm.league_id = ?`
      )
      .all(String(freshLeague.id)) as any[];
    const nicknameByUser = new Map<string, string>();
    for (const m of members ?? []) nicknameByUser.set(String(m.user_id), String(m.nickname));

    const userDelta = new Map<string, number>();
    const roundDelta = new Map<number, number>();

    for (const pred of preds ?? []) {
      const round = Number(pred.round);
      const beforePts = scoreRacePoints(pred, beforeByRound.get(round));
      const afterPts = scoreRacePoints(pred, afterByRound.get(round));
      const delta = afterPts - beforePts;
      if (!delta) continue;

      const uid = String(pred.user_id);
      userDelta.set(uid, (userDelta.get(uid) ?? 0) + delta);
      roundDelta.set(round, (roundDelta.get(round) ?? 0) + delta);
    }

    const deltaPayload = {
      at: new Date().toISOString(),
      users: Array.from(userDelta.entries())
        .map(([user_id, delta]) => ({ user_id, nickname: nicknameByUser.get(user_id) ?? user_id, delta }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
      rounds: Array.from(roundDelta.entries())
        .map(([round, delta]) => ({ round, delta }))
        .sort((a, b) => a.round - b.round),
    };

    db()
      .prepare('insert into kv (k, v) values (?, ?) on conflict (k) do update set v = excluded.v')
      .run(`sync_delta:${freshLeague.id}:${seasonYear}`, JSON.stringify(deltaPayload));

    redirect(
      `/league/${p.code}/admin/results?eligible=${out.eligible}&synced=${out.synced}&skipped=${out.skipped}&changed=${out.changed}`
    );
  }

  async function verifySeasonPredictions() {
    'use server';
    redirect(`/league/${p.code}/admin?verify=season`);
  }

  async function verifyRacePredictions() {
    'use server';
    redirect(`/league/${p.code}/admin?verify=race`);
  }

  const pending = db()
    .prepare(
      `select r.user_id, u.nickname, r.created_at
       from league_join_requests r
       join users u on u.id = r.user_id
       where r.league_id = ? and r.status = 'pending'
       order by r.created_at asc`
    )
    .all(String(league.id)) as any[];

  const rounds = db()
    .prepare(
      `select round, name, quali_start, sprint_quali_start, sprint_race_start, race_start
       from races
       where season_year = ?
       order by round asc`
    )
    .all(seasonYear) as any[];

  const unlockRows = db()
    .prepare(
      `select round, prediction_key, is_enabled
       from prediction_unlock_overrides
       where league_id = ? and season_year = ? and is_enabled = 1`
    )
    .all(String(league.id), seasonYear) as any[];
  const unlockSet = new Set(unlockRows.map((r) => `${r.round}:${r.prediction_key}`));

  async function decide(formData: FormData) {
    'use server';
    const leagueId = String(formData.get('league_id') ?? '');
    const targetUserId = String(formData.get('user_id') ?? '');
    const decision = String(formData.get('decision') ?? '');
    if (!leagueId || !targetUserId) return;

    const { user: u, league: l, member: m } = await getLeagueByCode(p.code);
    if (!u || !l || !m || m.role !== 'owner') return;

    decideJoinRequest(u.id, leagueId, targetUserId, decision === 'approve' ? 'approve' : 'reject');

    const { publishEvent } = await import('@/lib/events');
    publishEvent('join_requests_updated', { leagueId, at: new Date().toISOString() });
  }

  async function del() {
    'use server';
    const { user: u, league: l, member: m } = await getLeagueByCode(p.code);
    if (!u || !l || !m || m.role !== 'owner') return;
    deleteLeague(u.id, String(l.id));
    const { publishEvent } = await import('@/lib/events');
    publishEvent('leagues_updated', { leagueId: String(l.id), at: new Date().toISOString() });
    redirect('/leagues');
  }

  async function invalidateSeasonPrediction(formData: FormData) {
    'use server';

    const targetUserId = String(formData.get('target_user_id') ?? '');
    if (!targetUserId) return;

    const { user: u, league: l, member: m } = await getLeagueByCode(p.code);
    if (!u || !l || !m || m.role !== 'owner') return;

    const now = new Date().toISOString();
    db()
      .prepare(
        `update season_predictions
         set invalidated_at = ?, invalidated_by = ?
         where league_id = ? and user_id = ? and season_year = ? and invalidated_at is null`
      )
      .run(now, u.id, String(l.id), targetUserId, seasonYear);

    db()
      .prepare('delete from random_prediction_reviews where league_id = ? and user_id = ? and season_year = ?')
      .run(String(l.id), targetUserId, seasonYear);

    const { publishEvent } = await import('@/lib/events');
    publishEvent('random_reviews_updated', { seasonYear, at: now });

    redirect(`/league/${p.code}/admin?verify=season`);
  }

  async function invalidateRacePrediction(formData: FormData) {
    'use server';

    const targetUserId = String(formData.get('target_user_id') ?? '');
    const targetRound = Number(formData.get('target_round') ?? 0);
    if (!targetUserId || !Number.isFinite(targetRound) || targetRound <= 0) return;

    const { user: u, league: l, member: m } = await getLeagueByCode(p.code);
    if (!u || !l || !m || m.role !== 'owner') return;

    db()
      .prepare('delete from race_predictions where league_id = ? and user_id = ? and season_year = ? and round = ?')
      .run(String(l.id), targetUserId, seasonYear, targetRound);

    redirect(`/league/${p.code}/admin?verify=race`);
  }

  async function setPredictionOverride(formData: FormData) {
    'use server';

    const targetRound = Number(formData.get('target_round') ?? 0);
    const predictionKey = String(formData.get('prediction_key') ?? '');
    const enabled = String(formData.get('enabled') ?? '0') === '1';
    if (!Number.isFinite(targetRound) || targetRound <= 0) return;

    const allowedKeys = new Set(['race_pole', 'race_podium', 'sprint_pole', 'sprint_podium']);
    if (!allowedKeys.has(predictionKey)) return;

    const { user: u, league: l, member: m } = await getLeagueByCode(p.code);
    if (!u || !l || !m || m.role !== 'owner') return;

    if (enabled) {
      db()
        .prepare(
          `insert into prediction_unlock_overrides (league_id, season_year, round, prediction_key, is_enabled, updated_by, updated_at)
           values (?, ?, ?, ?, 1, ?, ?)
           on conflict (league_id, season_year, round, prediction_key) do update set
             is_enabled=excluded.is_enabled,
             updated_by=excluded.updated_by,
             updated_at=excluded.updated_at`
        )
        .run(String(l.id), seasonYear, targetRound, predictionKey, u.id, new Date().toISOString());
    } else {
      db()
        .prepare('delete from prediction_unlock_overrides where league_id = ? and season_year = ? and round = ? and prediction_key = ?')
        .run(String(l.id), seasonYear, targetRound, predictionKey);
    }

    redirect(`/league/${p.code}/admin`);
  }

  const shouldVerifySeason = sp.verify === 'season';
  const shouldVerifyRace = sp.verify === 'race';
  const syncMessage =
    sp.sync === 'season'
      ? `Season data synced. Races: ${Number(sp.races ?? 0)}, Drivers: ${Number(sp.drivers ?? 0)}, Constructors: ${Number(sp.constructors ?? 0)}.`
      : null;

  const invalidSeasonPredictions = shouldVerifySeason
    ? (() => {
        const driverIds = new Set(
          (db().prepare('select driver_id from drivers').all() as any[]).map((r) => String(r.driver_id))
        );
        const constructorIds = new Set(
          (db().prepare('select constructor_id from constructors').all() as any[]).map((r) => String(r.constructor_id))
        );

        const rows = db()
          .prepare(
            `select sp.user_id, u.nickname, sp.wdc_json, sp.wcc_json, sp.submitted_at, sp.invalidated_at
             from season_predictions sp
             join users u on u.id = sp.user_id
             where sp.league_id = ? and sp.season_year = ?
             order by u.nickname asc`
          )
          .all(String(league.id), seasonYear) as any[];

        return rows
          .map((r) => {
            const wdc = parseObj(String(r.wdc_json || '{}'));
            const wcc = parseObj(String(r.wcc_json || '{}'));
            const issues = [
              ...collectSeasonIssues('WDC', 22, wdc, driverIds),
              ...collectSeasonIssues('WCC', 11, wcc, constructorIds),
            ];

            return {
              userId: String(r.user_id),
              nickname: String(r.nickname),
              submittedAt: String(r.submitted_at),
              invalidatedAt: r.invalidated_at ? String(r.invalidated_at) : null,
              issues,
            };
          })
          .filter((r) => r.issues.length > 0);
      })()
    : [];

  const invalidRacePredictions = shouldVerifyRace
    ? (() => {
        const driverIds = new Set(
          (db().prepare('select driver_id from drivers').all() as any[]).map((r) => String(r.driver_id))
        );

        const rows = db()
          .prepare(
            `select rp.user_id, u.nickname, rp.round, races.name as race_name,
                    rp.pole_driver_id, rp.p1_driver_id, rp.p2_driver_id, rp.p3_driver_id,
                    rp.sprint_pole_driver_id, rp.sprint_p1_driver_id, rp.sprint_p2_driver_id, rp.sprint_p3_driver_id,
                    rp.submitted_at
             from race_predictions rp
             join users u on u.id = rp.user_id
             join races on races.season_year = rp.season_year and races.round = rp.round
             where rp.league_id = ? and rp.season_year = ?
             order by rp.round asc, u.nickname asc`
          )
          .all(String(league.id), seasonYear) as any[];

        return rows
          .map((r) => {
            const issues = collectRaceIssues(
              {
                pole_driver_id: r.pole_driver_id ? String(r.pole_driver_id) : null,
                p1_driver_id: r.p1_driver_id ? String(r.p1_driver_id) : null,
                p2_driver_id: r.p2_driver_id ? String(r.p2_driver_id) : null,
                p3_driver_id: r.p3_driver_id ? String(r.p3_driver_id) : null,
                sprint_pole_driver_id: r.sprint_pole_driver_id ? String(r.sprint_pole_driver_id) : null,
                sprint_p1_driver_id: r.sprint_p1_driver_id ? String(r.sprint_p1_driver_id) : null,
                sprint_p2_driver_id: r.sprint_p2_driver_id ? String(r.sprint_p2_driver_id) : null,
                sprint_p3_driver_id: r.sprint_p3_driver_id ? String(r.sprint_p3_driver_id) : null,
              },
              driverIds
            );

            return {
              userId: String(r.user_id),
              nickname: String(r.nickname),
              round: Number(r.round),
              raceName: String(r.race_name),
              submittedAt: String(r.submitted_at),
              issues,
            };
          })
          .filter((r) => r.issues.length > 0);
      })()
    : [];

  return (
    <main className="app-bg">
      <div className="shell max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-xs muted">League Tools</div>
            <h1 className="text-5xl leading-none h-display">Admin</h1>
            <p className="mt-2 text-sm muted">Season {seasonYear}. Season picks lock at start of round 1.</p>
          </div>
          <Link className="btn" href={`/league/${league.code}`}>
            Back
          </Link>
        </div>

        <div className="mt-8 grid gap-3">
          <form action={syncSeason}>
            <PendingSubmitButton
              className="w-full card-solid p-5 text-left transition-shadow hover:shadow-[0_18px_45px_rgba(16,19,24,0.12)] disabled:opacity-70"
              pendingChildren={
                <>
                  <div className="mono text-xs muted">Data</div>
                  <div className="mt-1 text-lg font-semibold">Syncing season data...</div>
                  <div className="mt-1 text-sm muted">Fetching races, drivers, constructors.</div>
                </>
              }
            >
              <div className="mono text-xs muted">Data</div>
              <div className="mt-1 text-lg font-semibold">Sync season data</div>
              <div className="mt-1 text-sm muted">Races, drivers, constructors.</div>
            </PendingSubmitButton>
          </form>
          <form action={syncResults}>
            <PendingSubmitButton
              className="w-full card-solid p-5 text-left transition-shadow hover:shadow-[0_18px_45px_rgba(16,19,24,0.12)] disabled:opacity-70"
              pendingChildren={
                <>
                  <div className="mono text-xs muted">Results</div>
                  <div className="mt-1 text-lg font-semibold">Syncing results...</div>
                  <div className="mt-1 text-sm muted">Race pole/podium + sprint results.</div>
                </>
              }
            >
              <div className="mono text-xs muted">Results</div>
              <div className="mt-1 text-lg font-semibold">Sync completed race results</div>
              <div className="mt-1 text-sm muted">Race pole/podium + sprint results.</div>
            </PendingSubmitButton>
          </form>
          <Link href={`/league/${league.code}/season/review`} className="w-full card-solid p-5 text-left transition-shadow hover:shadow-[0_18px_45px_rgba(16,19,24,0.12)]">
            <div className="mono text-xs muted">Random</div>
            <div className="mt-1 text-lg font-semibold">Review random predictions</div>
            <div className="mt-1 text-sm muted">Mark correct/incorrect to award manual points.</div>
          </Link>
          <form action={verifySeasonPredictions}>
            <button className="w-full card-solid p-5 text-left transition-shadow hover:shadow-[0_18px_45px_rgba(16,19,24,0.12)]" type="submit">
              <div className="mono text-xs muted">Validation</div>
              <div className="mt-1 text-lg font-semibold">Verify season predictions</div>
              <div className="mt-1 text-sm muted">Checks WDC/WCC for duplicates and unknown IDs.</div>
            </button>
          </form>
          <form action={verifyRacePredictions}>
            <button className="w-full card-solid p-5 text-left transition-shadow hover:shadow-[0_18px_45px_rgba(16,19,24,0.12)]" type="submit">
              <div className="mono text-xs muted">Validation</div>
              <div className="mt-1 text-lg font-semibold">Verify race predictions</div>
              <div className="mt-1 text-sm muted">Checks race + sprint picks for duplicates and unknown IDs.</div>
            </button>
          </form>
        </div>

        {syncMessage ? (
          <div className="mt-4 card-solid p-4 text-sm">
            <div className="font-semibold">Sync status</div>
            <div className="mt-1 muted">{syncMessage}</div>
          </div>
        ) : null}

        <div className="mt-10">
          <div className="mono text-xs muted">LOCK OVERRIDES</div>
          <div className="mt-3 card-solid p-5">
            <div className="text-sm muted">Enable specific predictions after lock so users can still submit agreed picks.</div>
            <div className="mt-4 grid gap-3">
              {rounds.map((r) => (
                <div key={r.round} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">Round {r.round}: {String(r.name)}</div>
                      <div className="mt-1 mono text-xs muted">
                        Quali: {r.quali_start ? new Date(String(r.quali_start)).toLocaleString() : 'TBD'} | Sprint quali:{' '}
                        {r.sprint_quali_start ? new Date(String(r.sprint_quali_start)).toLocaleString() : 'TBD'} | Sprint race:{' '}
                        {r.sprint_race_start ? new Date(String(r.sprint_race_start)).toLocaleString() : 'TBD'} | Race:{' '}
                        {r.race_start ? new Date(String(r.race_start)).toLocaleString() : 'TBD'}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[
                      { key: 'race_pole', label: 'Race Pole' },
                      { key: 'race_podium', label: 'Race Podium' },
                      { key: 'sprint_pole', label: 'Sprint Pole' },
                      { key: 'sprint_podium', label: 'Sprint Podium' },
                    ].map((k) => {
                      const enabled = unlockSet.has(`${r.round}:${k.key}`);
                      return (
                        <form key={k.key} action={setPredictionOverride} className="flex items-center justify-between gap-3 field">
                          <input type="hidden" name="target_round" value={r.round} />
                          <input type="hidden" name="prediction_key" value={k.key} />
                          <input type="hidden" name="enabled" value={enabled ? '0' : '1'} />
                          <div className="text-sm">
                            <span className="font-medium">{k.label}</span>{' '}
                            <span className="mono text-xs muted">{enabled ? 'ENABLED' : 'LOCKED'}</span>
                          </div>
                          <button className="btn" type="submit">{enabled ? 'Disable' : 'Enable'}</button>
                        </form>
                      );
                    })}
                  </div>
                </div>
              ))}

              {rounds.length === 0 ? (
                <div className="text-sm muted">No rounds available yet. Sync season data first.</div>
              ) : null}
            </div>
          </div>
        </div>

        {shouldVerifySeason ? (
          <div className="mt-10">
            <div className="mono text-xs muted">SEASON VALIDATION</div>
            <div className="mt-3 grid gap-3">
              {invalidSeasonPredictions.length === 0 ? (
                <div className="card-solid p-5 text-sm">
                  <div className="font-semibold">No invalid predictions found</div>
                  <div className="mt-1 muted">All submitted WDC/WCC picks are valid and unique.</div>
                </div>
              ) : (
                invalidSeasonPredictions.map((r) => (
                  <div key={r.userId} className="card-solid p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold">{r.nickname}</div>
                        <div className="mt-1 mono text-xs muted">Submitted: {new Date(r.submittedAt).toLocaleString()}</div>
                        {r.invalidatedAt ? (
                          <div className="mt-1 mono text-xs muted">Invalidated: {new Date(r.invalidatedAt).toLocaleString()}</div>
                        ) : null}
                      </div>
                      {!r.invalidatedAt ? (
                        <form action={invalidateSeasonPrediction}>
                          <input type="hidden" name="target_user_id" value={r.userId} />
                          <ConfirmSubmitButton
                            className="btn"
                            message={`Invalidate ${r.nickname}'s season prediction? They will need to resubmit valid picks.`}
                          >
                            Invalidate prediction
                          </ConfirmSubmitButton>
                        </form>
                      ) : (
                        <div className="mono text-xs muted">ALREADY INVALID</div>
                      )}
                    </div>

                    <div className="mt-3 grid gap-1 text-sm">
                      {r.issues.map((issue) => (
                        <div key={issue} className="mono">- {issue}</div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        {shouldVerifyRace ? (
          <div className="mt-10">
            <div className="mono text-xs muted">RACE VALIDATION</div>
            <div className="mt-3 grid gap-3">
              {invalidRacePredictions.length === 0 ? (
                <div className="card-solid p-5 text-sm">
                  <div className="font-semibold">No invalid race predictions found</div>
                  <div className="mt-1 muted">All quali/race picks are valid.</div>
                </div>
              ) : (
                invalidRacePredictions.map((r) => (
                  <div key={`${r.round}:${r.userId}`} className="card-solid p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold">{r.nickname}</div>
                        <div className="mt-1 mono text-xs muted">
                          Round {r.round}: {r.raceName}
                        </div>
                        <div className="mt-1 mono text-xs muted">Submitted: {new Date(r.submittedAt).toLocaleString()}</div>
                      </div>
                      <form action={invalidateRacePrediction}>
                        <input type="hidden" name="target_user_id" value={r.userId} />
                        <input type="hidden" name="target_round" value={r.round} />
                        <ConfirmSubmitButton
                          className="btn"
                          message={`Invalidate ${r.nickname}'s round ${r.round} prediction? This will delete that race prediction.`}
                        >
                          Invalidate prediction
                        </ConfirmSubmitButton>
                      </form>
                    </div>

                    <div className="mt-3 grid gap-1 text-sm">
                      {r.issues.map((issue) => (
                        <div key={issue} className="mono">- {issue}</div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : null}

        <div className="mt-10">
          <div className="mono text-xs muted">JOIN REQUESTS</div>
          <div className="mt-3 grid gap-3">
            {pending.map((r: any) => (
              <div key={r.user_id} className="card-solid p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{r.nickname}</div>
                    <div className="mt-1 mono text-xs muted">Requested: {new Date(r.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <form action={decide}>
                      <input type="hidden" name="league_id" value={league.id} />
                      <input type="hidden" name="user_id" value={r.user_id} />
                      <input type="hidden" name="decision" value="reject" />
                      <button className="btn" type="submit">Reject</button>
                    </form>
                    <form action={decide}>
                      <input type="hidden" name="league_id" value={league.id} />
                      <input type="hidden" name="user_id" value={r.user_id} />
                      <input type="hidden" name="decision" value="approve" />
                      <button className="btn btn-primary" type="submit">Approve</button>
                    </form>
                  </div>
                </div>
              </div>
            ))}

            {pending.length === 0 ? (
              <div className="card-solid p-5 text-sm">
                <div className="font-semibold">No pending requests</div>
                <div className="mt-1 muted">When someone taps “Request to join”, it will appear here.</div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-10">
          <div className="mono text-xs muted">DANGER ZONE</div>
          <div className="mt-3 card-solid p-5">
            <div className="text-lg font-semibold">Delete league</div>
            <div className="mt-1 text-sm muted">This removes the league and all its predictions/results for all members.</div>
            <form action={del} className="mt-4">
              <button className="btn" type="submit">Delete permanently</button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
