import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLeagueByCode } from '@/lib/league';
import { db } from '@/lib/db';

export default async function LeagueRacesPage({ params }: { params: { code: string } }) {
  const { league, user } = await getLeagueByCode(params.code);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/league/${params.code}/races`)}`);
  if (!league) return notFound();

  const seasonYear = new Date().getUTCFullYear();
  const races = db()
    .prepare('select season_year, round, name, race_start from races where season_year = ? order by round asc')
    .all(seasonYear) as any[];
  const results = db().prepare('select season_year, round from race_results where season_year = ?').all(seasonYear) as any[];
  const resultSet = new Set(results.map((r) => `${r.season_year}:${r.round}`));

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Races</h1>
        <Link className="rounded-md border px-3 py-2 text-sm" href={`/league/${league.code}`}>
          Back
        </Link>
      </div>

      <p className="mt-2 text-sm text-gray-600">
        If this list is empty, sync season data in{' '}
        <Link className="underline" href={`/league/${league.code}/admin`}>
          admin
        </Link>
        .
      </p>

      <div className="mt-6 grid gap-3">
        {races.map((race) => {
          const hasResult = resultSet.has(`${race.season_year}:${race.round}`);
          return (
            <Link
              key={`${race.season_year}:${race.round}`}
              href={`/league/${league.code}/races/${race.round}`}
              className="rounded-lg border bg-white p-4 hover:bg-gray-50"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">
                    Round {race.round}: {race.name}
                  </div>
                  <div className="text-xs text-gray-600">
                    {race.race_start ? new Date(race.race_start).toLocaleString() : 'TBD'}
                  </div>
                </div>
                <div className="text-xs text-gray-600">{hasResult ? 'Certified' : 'Pending'}</div>
              </div>
            </Link>
          );
        })}

        {races.length === 0 ? (
          <div className="rounded-lg border bg-white p-4 text-sm text-gray-700">No races loaded.</div>
        ) : null}
      </div>
    </main>
  );
}
