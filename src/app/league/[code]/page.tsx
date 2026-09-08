import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLeagueByCode } from '@/lib/league';
import { leaveLeague } from '@/lib/leagues';

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

  return (
    <main className="app-bg">
      <div className="shell">
        <div className="page-header">
          <div>
            <div className="eyebrow">League Control</div>
            <h1 className="mt-3 text-6xl leading-[0.88] h-display md:text-8xl">{league.name}</h1>
            <div className="mt-4 flex items-center gap-3 text-sm muted">
              <span>Invite code</span>
              <span className="border border-[var(--border)] bg-[var(--surface)] px-2 py-1 mono text-xs tracking-widest">{league.code}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!isOwner ? (
              <form action={leave}>
                <button className="btn" type="submit">Leave league</button>
              </form>
            ) : null}
            <Link className="btn" href="/leagues">All leagues</Link>
          </div>
        </div>

        <div className="feature-grid mt-10 wipe-in">
          <Link className="feature-card" data-index="01" href={`/league/${league.code}/season`}>
            <div className="eyebrow">Season</div>
            <div className="feature-card-title mt-5">WDC / WCC + Random</div>
            <div className="mt-3 max-w-xs text-sm muted">Set the long game before the first lights go out.</div>
          </Link>
          <Link className="feature-card" data-index="02" href={`/league/${league.code}/races`}>
            <div className="eyebrow">Race Weekends</div>
            <div className="feature-card-title mt-5">Pole, Sprint & Podium</div>
            <div className="mt-3 max-w-xs text-sm muted">Make picks session by session. Results certify automatically.</div>
          </Link>
          <Link className="feature-card" data-index="03" href={`/league/${league.code}/leaderboard`}>
            <div className="eyebrow">Standings</div>
            <div className="feature-card-title mt-5">League Leaderboard</div>
            <div className="mt-3 max-w-xs text-sm muted">Current scores, season history and championship wins.</div>
          </Link>
          <Link className="feature-card" data-index="04" href={`/league/${league.code}/karting`}>
            <div className="eyebrow">Real Track</div>
            <div className="feature-card-title mt-5">Karting Sessions</div>
            <div className="mt-3 max-w-xs text-sm muted">Log session bests and follow your pace over time.</div>
          </Link>
          {isOwner ? (
            <Link
              className="feature-card"
              data-index="05"
              href={`/league/${league.code}/admin`}
            >
              <div className="eyebrow">Owner</div>
              <div className="feature-card-title mt-5">Race Control</div>
              <div className="mt-3 max-w-xs text-sm muted">Sync results, review picks and manage access.</div>
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}
