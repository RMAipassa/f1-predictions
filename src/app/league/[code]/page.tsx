import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLeagueByCode } from '@/lib/league';

export default async function LeaguePage({ params }: { params: { code: string } }) {
  const { league, user } = await getLeagueByCode(params.code);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/league/${params.code}`)}`);
  if (!league) return notFound();

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{league.name}</h1>
          <div className="mt-1 text-sm text-gray-600">Invite code: {league.code}</div>
        </div>
        <Link className="rounded-md border px-3 py-2 text-sm" href="/leagues">
          Back
        </Link>
      </div>

      <div className="mt-6 grid gap-3">
        <Link className="rounded-lg border bg-white p-4 hover:bg-gray-50" href={`/league/${league.code}/season`}>
          Season predictions (WDC/WCC + random)
        </Link>
        <Link className="rounded-lg border bg-white p-4 hover:bg-gray-50" href={`/league/${league.code}/races`}>
          Race predictions (pole + podium)
        </Link>
        <Link className="rounded-lg border bg-white p-4 hover:bg-gray-50" href={`/league/${league.code}/leaderboard`}>
          Leaderboard
        </Link>
        <Link className="rounded-lg border bg-white p-4 hover:bg-gray-50" href={`/league/${league.code}/admin`}>
          Admin (sync season + results)
        </Link>
      </div>
    </main>
  );
}
