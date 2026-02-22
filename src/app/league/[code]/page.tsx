import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLeagueByCode } from '@/lib/league';
import { deleteLeague, leaveLeague } from '@/lib/leagues';

export default async function LeaguePage({ params }: { params: Promise<{ code: string }> }) {
  const p = await params;
  const { league, user } = await getLeagueByCode(p.code);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/league/${p.code}`)}`);
  if (!league) return notFound();

  const isOwner = String(league.owner_id) === user.id;

  async function leave() {
    'use server';
    const { league: l, user: u } = await getLeagueByCode(p.code);
    if (!l || !u) return;
    leaveLeague(u.id, String(l.id));
  }

  async function del() {
    'use server';
    const { league: l, user: u } = await getLeagueByCode(p.code);
    if (!l || !u) return;
    deleteLeague(u.id, String(l.id));
  }

  return (
    <main className="app-bg">
      <div className="shell">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mono text-xs muted">League</div>
          <h1 className="text-5xl leading-none h-display">{league.name}</h1>
          <div className="mt-2 text-sm muted">Invite code: <span className="mono">{league.code}</span></div>
        </div>
        <div className="flex items-center gap-2">
          {!isOwner ? (
            <form action={leave}>
              <button className="btn" type="submit">Leave league</button>
            </form>
          ) : null}
          {isOwner ? (
            <form action={del}>
              <button className="btn" type="submit">Delete league</button>
            </form>
          ) : null}
          <Link className="btn" href="/leagues">Back</Link>
        </div>
      </div>

        <div className="mt-8 grid gap-3 md:grid-cols-2">
          <Link className="card-solid p-5 transition-shadow hover:shadow-[0_18px_45px_rgba(16,19,24,0.12)]" href={`/league/${league.code}/season`}>
            <div className="mono text-xs muted">Season</div>
            <div className="mt-1 text-lg font-semibold">WDC / WCC + Random</div>
            <div className="mt-1 text-sm muted">Locks at start of Race 1.</div>
          </Link>
          <Link className="card-solid p-5 transition-shadow hover:shadow-[0_18px_45px_rgba(16,19,24,0.12)]" href={`/league/${league.code}/races`}>
            <div className="mono text-xs muted">Race</div>
            <div className="mt-1 text-lg font-semibold">Pole + Podium</div>
            <div className="mt-1 text-sm muted">Auto-certified from results.</div>
          </Link>
          <Link className="card-solid p-5 transition-shadow hover:shadow-[0_18px_45px_rgba(16,19,24,0.12)]" href={`/league/${league.code}/leaderboard`}>
            <div className="mono text-xs muted">Points</div>
            <div className="mt-1 text-lg font-semibold">Leaderboard</div>
            <div className="mt-1 text-sm muted">Race points + manual random points.</div>
          </Link>
          {isOwner ? (
            <Link
              className="card-solid p-5 transition-shadow hover:shadow-[0_18px_45px_rgba(16,19,24,0.12)]"
              href={`/league/${league.code}/admin`}
            >
              <div className="mono text-xs muted">Tools</div>
              <div className="mt-1 text-lg font-semibold">Admin</div>
              <div className="mt-1 text-sm muted">Sync season + results.</div>
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
