import { notFound, redirect } from 'next/navigation';
import { getLeagueByCode } from '@/lib/league';
import { syncCompletedRaceResults, syncSeasonData } from '@/lib/f1/sync';

export default async function LeagueAdminPage({ params }: { params: { code: string } }) {
  const { league, member, user } = await getLeagueByCode(params.code);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/league/${params.code}/admin`)}`);
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

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">League admin</h1>
      <p className="mt-1 text-sm text-gray-600">
        Season {seasonYear}. Season predictions lock at start of round 1.
      </p>

      <div className="mt-6 grid gap-3">
        <form action={syncSeason}>
          <button className="w-full rounded-lg border bg-white p-4 text-left hover:bg-gray-50" type="submit">
            Sync season data (races, drivers, constructors)
          </button>
        </form>
        <form action={syncResults}>
          <button className="w-full rounded-lg border bg-white p-4 text-left hover:bg-gray-50" type="submit">
            Sync completed race results (pole + podium)
          </button>
        </form>
      </div>
    </main>
  );
}
