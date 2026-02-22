import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLeagueByCode } from '@/lib/league';
import { db } from '@/lib/db';
import LiveUpdates from '@/components/LiveUpdates';

function scoreRacePick(pred: any, result: any) {
  if (!pred || !result) return { points: 0, breakdown: { pole: 0, p1: 0, p2: 0, p3: 0 } };
  const pole = pred.pole_driver_id && result.pole_driver_id && pred.pole_driver_id === result.pole_driver_id ? 1 : 0;
  const p1 = pred.p1_driver_id && result.p1_driver_id && pred.p1_driver_id === result.p1_driver_id ? 1 : 0;
  const p2 = pred.p2_driver_id && result.p2_driver_id && pred.p2_driver_id === result.p2_driver_id ? 1 : 0;
  const p3 = pred.p3_driver_id && result.p3_driver_id && pred.p3_driver_id === result.p3_driver_id ? 1 : 0;
  const points = pole + p1 + p2 + p3;
  return { points, breakdown: { pole, p1, p2, p3 } };
}

export default async function MemberPredictionsPage({
  params,
}: {
  params: Promise<{ code: string; userId: string }>;
}) {
  const p = await params;
  const { league, user } = await getLeagueByCode(p.code);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/league/${p.code}/leaderboard`)}`);
  if (!league) return notFound();

  const targetUserId = String(p.userId);
  const seasonYear = new Date().getUTCFullYear();
  const viewerIsOwner = String(league.owner_id) === user.id;
  const viewerIsSelf = user.id === targetUserId;

  const target = db()
    .prepare(
      `select lm.user_id, lm.role, u.nickname
       from league_members lm
       join users u on u.id = lm.user_id
       where lm.league_id = ? and lm.user_id = ?`
    )
    .get(String(league.id), targetUserId) as any;
  if (!target) return notFound();

  const drivers = db()
    .prepare('select driver_id, given_name, family_name, code from drivers order by family_name asc')
    .all() as any[];
  const constructors = db().prepare('select constructor_id, name from constructors order by name asc').all() as any[];
  const race1 = db().prepare('select race_start from races where season_year = ? and round = 1').get(seasonYear) as any;
  const races = db()
    .prepare('select round, name, race_start from races where season_year = ? order by round asc')
    .all(seasonYear) as any[];

  const driverLabelById = new Map<string, string>();
  for (const d of drivers ?? []) {
    driverLabelById.set(
      String(d.driver_id),
      `${d.family_name}, ${d.given_name}${d.code ? ` (${d.code})` : ''}`
    );
  }
  const constructorLabelById = new Map<string, string>();
  for (const c of constructors ?? []) constructorLabelById.set(String(c.constructor_id), String(c.name));

  const seasonPredRow = db()
    .prepare(
      'select wdc_json, wcc_json, random_json, submitted_at from season_predictions where league_id = ? and user_id = ? and season_year = ?'
    )
    .get(String(league.id), targetUserId, seasonYear) as any;

  const preds = db()
    .prepare(
      `select round, pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id, submitted_at
       from race_predictions
       where league_id = ? and user_id = ? and season_year = ?`
    )
    .all(String(league.id), targetUserId, seasonYear) as any[];
  const results = db()
    .prepare('select round, pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id, fetched_at from race_results where season_year = ?')
    .all(seasonYear) as any[];

  const predByRound = new Map<number, any>();
  for (const rp of preds ?? []) predByRound.set(Number(rp.round), rp);

  const resultByRound = new Map<number, any>();
  for (const rr of results ?? []) resultByRound.set(Number(rr.round), rr);

  const lockAt = race1?.race_start ? new Date(String(race1.race_start)) : null;
  const seasonLocked = lockAt ? lockAt.getTime() <= Date.now() : false;
  const canViewSeason = viewerIsOwner || viewerIsSelf || seasonLocked;

  const wdc = canViewSeason && seasonPredRow?.wdc_json ? JSON.parse(String(seasonPredRow.wdc_json)) : null;
  const wcc = canViewSeason && seasonPredRow?.wcc_json ? JSON.parse(String(seasonPredRow.wcc_json)) : null;
  const random = canViewSeason && seasonPredRow?.random_json ? JSON.parse(String(seasonPredRow.random_json)) : null;

  return (
    <main className="app-bg">
      <LiveUpdates />
      <div className="shell">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-xs muted">Season {seasonYear}</div>
            <h1 className="text-5xl leading-none h-display">{String(target.nickname)}</h1>
            <div className="mt-2 text-sm muted">
              Role: <span className="mono">{String(target.role)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Link className="btn" href={`/league/${league.code}`}>
              League
            </Link>
            <Link className="btn" href={`/league/${league.code}/leaderboard`}>
              Leaderboard
            </Link>
          </div>
        </div>

        <section className="mt-8 card-solid p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-2xl h-display">Season Predictions</h2>
            <div className="mono text-xs muted">{canViewSeason ? 'VISIBLE' : 'LOCKED'}</div>
          </div>

          {!canViewSeason ? (
            <div className="mt-2 text-sm muted">Season picks become visible once the season locks.</div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="card p-4">
                <div className="mono text-xs muted">WDC</div>
                <div className="mt-2 grid gap-1 text-sm">
                  {Array.from({ length: 10 }).map((_, i) => {
                    const pos = i + 1;
                    const id = wdc?.[`p${pos}`];
                    const label = id ? driverLabelById.get(String(id)) ?? String(id) : '—';
                    return (
                      <div key={pos}>
                        <span className="mono muted">P{pos}</span> {label}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card p-4">
                <div className="mono text-xs muted">WCC</div>
                <div className="mt-2 grid gap-1 text-sm">
                  {Array.from({ length: 5 }).map((_, i) => {
                    const pos = i + 1;
                    const id = wcc?.[`p${pos}`];
                    const label = id ? constructorLabelById.get(String(id)) ?? String(id) : '—';
                    return (
                      <div key={pos}>
                        <span className="mono muted">P{pos}</span> {label}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="card p-4">
                <div className="mono text-xs muted">Random</div>
                <div className="mt-2 grid gap-1 text-sm">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i}>
                      <span className="mono muted">R{i}</span> {random?.[`r${i}`] ?? '—'}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mt-6 card-solid p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-2xl h-display">Race Predictions</h2>
            <div className="mono text-xs muted">POLE + PODIUM</div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left" style={{ background: 'rgba(16, 19, 24, 0.03)' }}>
                <tr>
                  <th className="px-3 py-2">Round</th>
                  <th className="px-3 py-2">Race</th>
                  <th className="px-3 py-2">Pole</th>
                  <th className="px-3 py-2">P1</th>
                  <th className="px-3 py-2">P2</th>
                  <th className="px-3 py-2">P3</th>
                  <th className="px-3 py-2">Pts</th>
                </tr>
              </thead>
              <tbody>
                {(races ?? []).map((race) => {
                  const round = Number(race.round);
                  const lockAt = race.race_start ? new Date(String(race.race_start)) : null;
                  const locked = lockAt ? lockAt.getTime() <= Date.now() : false;
                  const canView = viewerIsOwner || viewerIsSelf || locked;

                  const pred = predByRound.get(round);
                  const result = resultByRound.get(round);
                  const scoring = canView && result ? scoreRacePick(pred, result) : null;

                  const label = (id: any) => {
                    if (!id) return '—';
                    return driverLabelById.get(String(id)) ?? String(id);
                  };

                  return (
                    <tr key={round} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-3 py-2 mono">{round}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{String(race.name)}</div>
                        <div className="mono text-xs muted">{canView ? 'VISIBLE' : 'LOCKED'}</div>
                      </td>
                      <td className="px-3 py-2">{canView ? label(pred?.pole_driver_id) : '—'}</td>
                      <td className="px-3 py-2">{canView ? label(pred?.p1_driver_id) : '—'}</td>
                      <td className="px-3 py-2">{canView ? label(pred?.p2_driver_id) : '—'}</td>
                      <td className="px-3 py-2">{canView ? label(pred?.p3_driver_id) : '—'}</td>
                      <td className="px-3 py-2 mono">{scoring ? scoring.points : canView ? 0 : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
