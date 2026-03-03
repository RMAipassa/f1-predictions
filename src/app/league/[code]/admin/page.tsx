import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getLeagueByCode } from '@/lib/league';
import { syncCompletedRaceResults, syncSeasonData } from '@/lib/f1/sync';
import { db } from '@/lib/db';
import { decideJoinRequest, deleteLeague } from '@/lib/leagues';
import ConfirmSubmitButton from '@/components/ConfirmSubmitButton';

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

export default async function LeagueAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ verify?: string }>;
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
    await syncSeasonData(seasonYear);
  }

  async function syncResults() {
    'use server';
    await syncCompletedRaceResults(seasonYear);
  }

  async function verifySeasonPredictions() {
    'use server';
    redirect(`/league/${p.code}/admin?verify=season`);
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

  const shouldVerifySeason = sp.verify === 'season';

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
            <button className="w-full card-solid p-5 text-left transition-shadow hover:shadow-[0_18px_45px_rgba(16,19,24,0.12)]" type="submit">
              <div className="mono text-xs muted">Data</div>
              <div className="mt-1 text-lg font-semibold">Sync season data</div>
              <div className="mt-1 text-sm muted">Races, drivers, constructors.</div>
            </button>
          </form>
          <form action={syncResults}>
            <button className="w-full card-solid p-5 text-left transition-shadow hover:shadow-[0_18px_45px_rgba(16,19,24,0.12)]" type="submit">
              <div className="mono text-xs muted">Results</div>
              <div className="mt-1 text-lg font-semibold">Sync completed race results</div>
              <div className="mt-1 text-sm muted">Pole + podium certification.</div>
            </button>
          </form>
          <form action={verifySeasonPredictions}>
            <button className="w-full card-solid p-5 text-left transition-shadow hover:shadow-[0_18px_45px_rgba(16,19,24,0.12)]" type="submit">
              <div className="mono text-xs muted">Validation</div>
              <div className="mt-1 text-lg font-semibold">Verify season predictions</div>
              <div className="mt-1 text-sm muted">Checks WDC/WCC for duplicates and unknown IDs.</div>
            </button>
          </form>
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
