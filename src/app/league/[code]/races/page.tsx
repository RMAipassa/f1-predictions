import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLeagueByCode } from '@/lib/league';
import { db } from '@/lib/db';
import LiveUpdates from '@/components/LiveUpdates';

export default async function LeagueRacesPage({ params }: { params: Promise<{ code: string }> }) {
  const p = await params;
  const { league, user } = await getLeagueByCode(p.code);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/league/${p.code}/races`)}`);
  if (!league) return notFound();

  const isOwner = String(league.owner_id) === user.id;

  const seasonYear = new Date().getUTCFullYear();
  const races = db()
    .prepare('select season_year, round, name, race_start from races where season_year = ? order by round asc')
    .all(seasonYear) as any[];
  const results = db().prepare('select season_year, round from race_results where season_year = ?').all(seasonYear) as any[];
  const resultSet = new Set(results.map((r) => `${r.season_year}:${r.round}`));

  return (
    <main className="app-bg">
      <LiveUpdates />
      <div className="shell">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-xs muted">Race Weekend</div>
            <h1 className="text-5xl leading-none h-display">Races</h1>
            <p className="mt-2 text-sm muted">
              If this list is empty, {isOwner ? (
                <>
                  sync season data in{' '}
                  <Link className="underline underline-offset-4" href={`/league/${league.code}/admin`}>
                    admin
                  </Link>
                  .
                </>
              ) : (
                <>ask the league owner to sync season data.</>
              )}
            </p>
          </div>
          <Link className="btn" href={`/league/${league.code}`}>
            Back
          </Link>
        </div>

        <div className="mt-8 grid gap-3">
        {races.map((race) => {
          const hasResult = resultSet.has(`${race.season_year}:${race.round}`);
          return (
            <Link
              key={`${race.season_year}:${race.round}`}
              href={`/league/${league.code}/races/${race.round}`}
              className="card-solid p-4 transition-shadow hover:shadow-[0_18px_45px_rgba(16,19,24,0.12)]"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">
                    Round {race.round}: {race.name}
                  </div>
                  <div className="mt-1 mono text-xs muted">
                    {race.race_start ? new Date(race.race_start).toLocaleString() : 'TBD'}
                  </div>
                </div>
                <div className={`mono text-xs ${hasResult ? '' : 'muted'}`}>{hasResult ? 'CERTIFIED' : 'PENDING'}</div>
              </div>
            </Link>
          );
        })}

        {races.length === 0 ? (
          <div className="card-solid p-5 text-sm">
            <div className="font-semibold">No races loaded</div>
            <div className="mt-1 muted">Open Admin and run “Sync season data”.</div>
          </div>
        ) : null}
        </div>
      </div>
    </main>
  );
}
