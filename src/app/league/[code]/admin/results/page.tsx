import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLeagueByCode } from '@/lib/league';
import { db } from '@/lib/db';

function labelDriver(id: unknown, byId: Map<string, string>) {
  if (!id) return '—';
  const key = String(id);
  return byId.get(key) ?? key;
}

export default async function AdminSyncedResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ eligible?: string; synced?: string; skipped?: string; changed?: string }>;
}) {
  const p = await params;
  const sp = await searchParams;
  const { league, member, user } = await getLeagueByCode(p.code);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/league/${p.code}/admin/results`)}`);
  if (!league) return notFound();
  if (!member || member.role !== 'owner') return notFound();

  const seasonYear = new Date().getUTCFullYear();

  const drivers = db()
    .prepare('select driver_id, given_name, family_name, code from drivers order by family_name asc')
    .all() as any[];
  const driverById = new Map<string, string>();
  for (const d of drivers ?? []) {
    driverById.set(String(d.driver_id), `${d.family_name}, ${d.given_name}${d.code ? ` (${d.code})` : ''}`);
  }

  const rows = db()
    .prepare(
      `select rr.round, races.name,
              rr.pole_driver_id, rr.p1_driver_id, rr.p2_driver_id, rr.p3_driver_id,
              rr.sprint_pole_driver_id, rr.sprint_p1_driver_id, rr.sprint_p2_driver_id, rr.sprint_p3_driver_id,
              rr.fetched_at
       from race_results rr
       join races on races.season_year = rr.season_year and races.round = rr.round
       where rr.season_year = ?
       order by rr.round asc`
    )
    .all(seasonYear) as any[];

  async function setManualSprintPole(formData: FormData) {
    'use server';

    const targetRound = Number(formData.get('target_round') ?? 0);
    const sprintPoleDriverIdRaw = String(formData.get('sprint_pole_driver_id') ?? '').trim();
    if (!Number.isFinite(targetRound) || targetRound <= 0) return;

    const { league: freshLeague, member: freshMember, user: freshUser } = await getLeagueByCode(p.code);
    if (!freshLeague || !freshUser || !freshMember || freshMember.role !== 'owner') return;

    const validDriverIds = new Set(
      (db().prepare('select driver_id from drivers').all() as any[]).map((r) => String(r.driver_id))
    );
    const sprintPoleDriverId = sprintPoleDriverIdRaw || null;
    if (sprintPoleDriverId && !validDriverIds.has(sprintPoleDriverId)) return;

    db()
      .prepare('update race_results set sprint_pole_driver_id = ? where season_year = ? and round = ?')
      .run(sprintPoleDriverId, seasonYear, targetRound);

    const { publishEvent } = await import('@/lib/events');
    publishEvent('race_results_updated', { seasonYear, round: targetRound, at: new Date().toISOString() });

    redirect(`/league/${p.code}/admin/results`);
  }

  const deltaRow = db()
    .prepare('select v from kv where k = ?')
    .get(`sync_delta:${league.id}:${seasonYear}`) as any;
  const reportRow = db()
    .prepare('select v from kv where k = ?')
    .get(`sync_report:${league.id}:${seasonYear}`) as any;

  let deltaData: {
    at: string;
    users: Array<{ user_id: string; nickname: string; delta: number }>;
    rounds: Array<{ round: number; delta: number }>;
  } | null = null;
  try {
    if (deltaRow?.v) deltaData = JSON.parse(String(deltaRow.v));
  } catch {
    deltaData = null;
  }

  let reportData: {
    at: string;
    eligibleRounds: number[];
    skippedDetails: Array<{ round: number; reason: 'no_data' | 'fetch_error' }>;
  } | null = null;
  try {
    if (reportRow?.v) reportData = JSON.parse(String(reportRow.v));
  } catch {
    reportData = null;
  }

  const skippedReasonLabel: Record<'no_data' | 'fetch_error', string> = {
    no_data: 'No published data yet for any ready part of the round',
    fetch_error: 'Fetch/API error while syncing this round',
  };

  return (
    <main className="app-bg">
      <div className="shell">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-xs muted">Season {seasonYear}</div>
            <h1 className="text-5xl leading-none h-display">Synced Results</h1>
            <div className="mt-2 text-sm muted">
              Sync finished. Eligible: {Number(sp.eligible ?? 0)} | Synced: {Number(sp.synced ?? 0)} | Changed:{' '}
              {Number(sp.changed ?? 0)} | Skipped: {Number(sp.skipped ?? 0)}
            </div>
          </div>
          <div className="flex gap-2">
            <Link className="btn" href={`/league/${league.code}/leaderboard`}>
              Leaderboard
            </Link>
            <Link className="btn" href={`/league/${league.code}/admin`}>
              Back to admin
            </Link>
          </div>
        </div>

        <div className="mt-8 overflow-x-auto card-solid p-4">
          {deltaData ? (
            <div className="mb-5 grid gap-3 md:grid-cols-2">
              <div className="card p-4">
                <div className="font-semibold">Points delta from latest sync</div>
                <div className="mt-1 text-xs muted">{new Date(deltaData.at).toLocaleString()}</div>
                <div className="mt-3 grid gap-1 text-sm">
                  {deltaData.users.length === 0 ? (
                    <div className="muted">No score changes from latest sync.</div>
                  ) : (
                    deltaData.users.map((u) => (
                      <div key={u.user_id} className="flex items-center justify-between gap-3">
                        <span>{u.nickname}</span>
                        <span className="mono">{u.delta > 0 ? `+${u.delta}` : String(u.delta)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="card p-4">
                <div className="font-semibold">Round delta</div>
                <div className="mt-1 text-xs muted">Total league points changed per round</div>
                <div className="mt-3 grid gap-1 text-sm">
                  {deltaData.rounds.length === 0 ? (
                    <div className="muted">No affected rounds.</div>
                  ) : (
                    deltaData.rounds.map((r) => (
                      <div key={r.round} className="flex items-center justify-between gap-3">
                        <span>Round {r.round}</span>
                        <span className="mono">{r.delta > 0 ? `+${r.delta}` : String(r.delta)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {reportData ? (
            <div className="mb-5 grid gap-3 md:grid-cols-2">
              <div className="card p-4">
                <div className="font-semibold">Eligible rounds this run</div>
                <div className="mt-1 text-xs muted">Rounds whose session times had already started</div>
                <div className="mt-3 text-sm">
                  {reportData.eligibleRounds.length === 0 ? (
                    <div className="muted">None.</div>
                  ) : (
                    <div className="mono">{reportData.eligibleRounds.join(', ')}</div>
                  )}
                </div>
              </div>

              <div className="card p-4">
                <div className="font-semibold">Skipped rounds</div>
                <div className="mt-1 text-xs muted">Why each round was skipped in this sync</div>
                <div className="mt-3 grid gap-2 text-sm">
                  {reportData.skippedDetails.length === 0 ? (
                    <div className="muted">No skipped rounds.</div>
                  ) : (
                    reportData.skippedDetails.map((s, idx) => (
                      <div key={`${s.round}:${idx}`}>
                        <span className="mono">Round {s.round}</span> - {skippedReasonLabel[s.reason]}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}

          <table className="w-full text-sm">
            <thead className="text-left" style={{ background: 'rgba(16, 19, 24, 0.03)' }}>
              <tr>
                <th className="px-3 py-2">Round</th>
                <th className="px-3 py-2">Race</th>
                <th className="px-3 py-2">Pole</th>
                <th className="px-3 py-2">P1</th>
                <th className="px-3 py-2">P2</th>
                <th className="px-3 py-2">P3</th>
                <th className="px-3 py-2">Sprint Pole</th>
                <th className="px-3 py-2">Sprint P1</th>
                <th className="px-3 py-2">Sprint P2</th>
                <th className="px-3 py-2">Sprint P3</th>
                <th className="px-3 py-2">Fetched</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={Number(r.round)} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-3 py-2 mono">{Number(r.round)}</td>
                  <td className="px-3 py-2">{String(r.name)}</td>
                  <td className="px-3 py-2">{labelDriver(r.pole_driver_id, driverById)}</td>
                  <td className="px-3 py-2">{labelDriver(r.p1_driver_id, driverById)}</td>
                  <td className="px-3 py-2">{labelDriver(r.p2_driver_id, driverById)}</td>
                  <td className="px-3 py-2">{labelDriver(r.p3_driver_id, driverById)}</td>
                  <td className="px-3 py-2">{labelDriver(r.sprint_pole_driver_id, driverById)}</td>
                  <td className="px-3 py-2">{labelDriver(r.sprint_p1_driver_id, driverById)}</td>
                  <td className="px-3 py-2">{labelDriver(r.sprint_p2_driver_id, driverById)}</td>
                  <td className="px-3 py-2">{labelDriver(r.sprint_p3_driver_id, driverById)}</td>
                  <td className="px-3 py-2 mono">{r.fetched_at ? new Date(String(r.fetched_at)).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {rows.length === 0 ? (
            <div className="p-4 text-sm muted">No race results saved yet for this season.</div>
          ) : null}
        </div>

        <div className="mt-6 card-solid p-4">
          <div className="font-semibold">Manual sprint pole override</div>
          <div className="mt-1 text-sm muted">
            If sprint pole is missing from APIs, set it manually here. Winner is never used as sprint pole.
          </div>

          <div className="mt-4 grid gap-2">
            {rows.map((r) => (
              <form key={`manual:${Number(r.round)}`} action={setManualSprintPole} className="grid gap-2 md:grid-cols-[1fr_1fr_auto] items-center">
                <input type="hidden" name="target_round" value={Number(r.round)} />
                <div className="text-sm">
                  <span className="mono">Round {Number(r.round)}</span> {String(r.name)}
                </div>
                <select className="field text-sm" name="sprint_pole_driver_id" defaultValue={r.sprint_pole_driver_id ? String(r.sprint_pole_driver_id) : ''}>
                  <option value="">— clear —</option>
                  {drivers.map((d) => (
                    <option key={String(d.driver_id)} value={String(d.driver_id)}>
                      {String(d.family_name)}, {String(d.given_name)}{d.code ? ` (${String(d.code)})` : ''}
                    </option>
                  ))}
                </select>
                <button className="btn" type="submit">Save pole</button>
              </form>
            ))}

            {rows.length === 0 ? <div className="text-sm muted">No rounds with synced results yet.</div> : null}
          </div>
        </div>
      </div>
    </main>
  );
}
