import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLeagueByCode } from '@/lib/league';
import { db } from '@/lib/db';
import LiveUpdates from '@/components/LiveUpdates';

const WEIGHTS: Record<number, number> = { 1: 8, 2: 6, 3: 4, 4: 2, 5: 1 };

function scoreRace(pred: any, result: any) {
  if (!pred || !result) return 0;
  let pts = 0;
  if (pred.pole_driver_id && result.pole_driver_id && pred.pole_driver_id === result.pole_driver_id) pts++;
  if (pred.p1_driver_id && result.p1_driver_id && pred.p1_driver_id === result.p1_driver_id) pts++;
  if (pred.p2_driver_id && result.p2_driver_id && pred.p2_driver_id === result.p2_driver_id) pts++;
  if (pred.p3_driver_id && result.p3_driver_id && pred.p3_driver_id === result.p3_driver_id) pts++;
  return pts;
}

export default async function LeaderboardPage({ params }: { params: Promise<{ code: string }> }) {
  const p = await params;
  const { league, user } = await getLeagueByCode(p.code);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/league/${p.code}/leaderboard`)}`);
  if (!league) return notFound();

  const seasonYear = new Date().getUTCFullYear();

  const members = db()
    .prepare(
      `select lm.user_id, lm.role, u.nickname
       from league_members lm
       join users u on u.id = lm.user_id
       where lm.league_id = ?
       order by u.nickname asc`
    )
    .all(String(league.id)) as any[];
  const preds = db()
    .prepare(
      'select user_id, round, pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id from race_predictions where league_id = ? and season_year = ?'
    )
    .all(String(league.id), seasonYear) as any[];
  const results = db()
    .prepare('select round, pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id from race_results where season_year = ?')
    .all(seasonYear) as any[];
  const randomReviews = db()
    .prepare('select user_id, idx, is_correct from random_prediction_reviews where league_id = ? and season_year = ?')
    .all(String(league.id), seasonYear) as any[];

  const resultsByRound = new Map<number, any>();
  for (const r of results ?? []) resultsByRound.set(Number(r.round), r);

  const racePointsByUser = new Map<string, number>();
  for (const p of preds ?? []) {
    const uid = String(p.user_id);
    const res = resultsByRound.get(Number(p.round));
    const add = scoreRace(p, res);
    racePointsByUser.set(uid, (racePointsByUser.get(uid) ?? 0) + add);
  }

  const randomPointsByUser = new Map<string, number>();
  for (const rr of randomReviews ?? []) {
    if (Number(rr.is_correct) !== 1) continue;
    const uid = String(rr.user_id);
    const idx = Number(rr.idx);
    randomPointsByUser.set(uid, (randomPointsByUser.get(uid) ?? 0) + (WEIGHTS[idx] ?? 0));
  }

  const rows = (members ?? []).map((m) => {
    const uid = String(m.user_id);
    const racePts = racePointsByUser.get(uid) ?? 0;
    const randomPts = randomPointsByUser.get(uid) ?? 0;
    return {
      user_id: uid,
      nickname: String(m.nickname),
      role: m.role,
      racePts,
      randomPts,
      total: racePts + randomPts,
    };
  });

  rows.sort((a, b) => b.total - a.total);

  return (
    <main className="app-bg">
      <LiveUpdates />
      <div className="shell">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-xs muted">Season {seasonYear}</div>
            <h1 className="text-5xl leading-none h-display">Leaderboard</h1>
            <div className="mt-2 text-sm muted">Race points + manual random points.</div>
          </div>
          <Link className="btn" href={`/league/${league.code}`}>
            Back
          </Link>
        </div>

        <div className="mt-8 overflow-hidden card-solid">
          <table className="w-full text-sm">
            <thead className="text-left" style={{ background: 'rgba(16, 19, 24, 0.03)' }}>
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Race</th>
              <th className="px-4 py-3">Random</th>
              <th className="px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.user_id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="px-4 py-3">
                  <div className="font-medium">{r.nickname}</div>
                  <div className="mono text-xs muted">{r.role}</div>
                </td>
                <td className="px-4 py-3 mono">{r.racePts}</td>
                <td className="px-4 py-3 mono">{r.randomPts}</td>
                <td className="px-4 py-3 mono font-semibold">{r.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>

        <div className="mt-3 text-xs muted">WDC/WCC season scoring not shown yet (needs final standings).</div>
      </div>
    </main>
  );
}
