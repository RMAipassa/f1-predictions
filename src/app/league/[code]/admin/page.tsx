import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getLeagueByCode } from '@/lib/league';
import { syncCompletedRaceResults, syncSeasonData } from '@/lib/f1/sync';

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
      </div>
    </main>
  );
}
