import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getLeagueByCode } from '@/lib/league';
import { syncCompletedRaceResults, syncSeasonData } from '@/lib/f1/sync';
import { db } from '@/lib/db';
import { decideJoinRequest } from '@/lib/leagues';

export default async function LeagueAdminPage({ params }: { params: Promise<{ code: string }> }) {
  const p = await params;
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
        </div>

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
      </div>
    </main>
  );
}
