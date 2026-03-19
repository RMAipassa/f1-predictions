import crypto from 'node:crypto';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLeagueByCode } from '@/lib/league';
import { db } from '@/lib/db';

function formatLapMs(ms: unknown) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const m = Math.floor(n / 60000);
  const s = Math.floor((n % 60000) / 1000);
  const milli = n % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(milli).padStart(3, '0')}`;
}

export default async function LeagueKartingPage({ params }: { params: Promise<{ code: string }> }) {
  const p = await params;
  const { league, user } = await getLeagueByCode(p.code);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/league/${p.code}/karting`)}`);
  if (!league) return notFound();

  const tracks = db()
    .prepare(
      `select t.id, t.name, t.location, t.created_at, u.nickname as created_by,
              count(ktt.id) as laps_count,
              min(ktt.lap_ms) as best_lap_ms
       from kart_tracks t
       join users u on u.id = t.created_by
       left join kart_track_times ktt on ktt.track_id = t.id
       where t.league_id = ?
       group by t.id, t.name, t.location, t.created_at, u.nickname
       order by t.created_at desc`
    )
    .all(String(league.id)) as any[];

  const myBestRows = db()
    .prepare(
      `select t.id as track_id, min(ktt.lap_ms) as best_lap_ms
       from kart_tracks t
       left join kart_track_times ktt on ktt.track_id = t.id and ktt.user_id = ?
       where t.league_id = ?
       group by t.id`
    )
    .all(user.id, String(league.id)) as any[];
  const myBestByTrack = new Map<string, number>();
  for (const row of myBestRows ?? []) {
    const trackId = String(row.track_id);
    const best = Number(row.best_lap_ms);
    if (Number.isFinite(best) && best > 0) myBestByTrack.set(trackId, best);
  }

  async function addTrack(formData: FormData) {
    'use server';

    const { league: freshLeague, user: freshUser } = await getLeagueByCode(p.code);
    if (!freshLeague || !freshUser) return;

    const name = String(formData.get('name') ?? '').trim();
    const location = String(formData.get('location') ?? '').trim();
    if (name.length < 2 || name.length > 80 || location.length > 80) return;

    db()
      .prepare('insert into kart_tracks (id, league_id, name, location, created_by, created_at) values (?,?,?,?,?,?)')
      .run(
        crypto.randomBytes(12).toString('hex'),
        String(freshLeague.id),
        name,
        location || null,
        freshUser.id,
        new Date().toISOString()
      );

    redirect(`/league/${p.code}/karting`);
  }

  return (
    <main className="app-bg">
      <div className="shell">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mono text-xs muted">League Karting</div>
            <h1 className="text-4xl leading-none h-display md:text-5xl">Tracks & Times</h1>
            <div className="mt-2 text-sm muted">Log session-best laps and compare personal bests per track.</div>
          </div>
          <Link className="btn" href={`/league/${league.code}`}>
            Back
          </Link>
        </div>

        <section className="mt-8 card-solid p-5">
          <div className="text-lg font-semibold">Add karting track</div>
          <form action={addTrack} className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input className="field" type="text" name="name" placeholder="Track name" required maxLength={80} />
            <input className="field" type="text" name="location" placeholder="Location (optional)" maxLength={80} />
            <button className="btn btn-primary" type="submit">Add track</button>
          </form>
        </section>

        <section className="mt-6 card-solid p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-lg font-semibold">Track list</div>
            <div className="mono text-xs muted">{tracks.length} tracks</div>
          </div>

          {tracks.length === 0 ? (
            <div className="mt-3 text-sm muted">No tracks yet. Add your first track above.</div>
          ) : (
            <>
              <div className="mt-4 grid gap-3 md:hidden">
                {tracks.map((t) => (
                  <div key={`m:${String(t.id)}`} className="card p-4">
                    <div className="font-medium">{String(t.name)}</div>
                    <div className="mt-1 text-xs muted">{t.location ? String(t.location) : 'No location'} • By {String(t.created_by)}</div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <div className="mono text-xs muted">League best</div>
                        <div className="mono">{formatLapMs(t.best_lap_ms)}</div>
                      </div>
                      <div>
                        <div className="mono text-xs muted">Your best</div>
                        <div className="mono">{formatLapMs(myBestByTrack.get(String(t.id)) ?? null)}</div>
                      </div>
                      <div>
                        <div className="mono text-xs muted">Sessions</div>
                        <div className="mono">{Number(t.laps_count) || 0}</div>
                      </div>
                    </div>
                    <Link className="btn mt-3" href={`/league/${league.code}/karting/${String(t.id)}`}>
                      View
                    </Link>
                  </div>
                ))}
              </div>

              <div className="mt-4 hidden overflow-x-auto md:block">
                <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left" style={{ background: 'rgba(16, 19, 24, 0.03)' }}>
                  <tr>
                    <th className="px-3 py-2">Track</th>
                    <th className="px-3 py-2">Location</th>
                    <th className="px-3 py-2">League best</th>
                    <th className="px-3 py-2">Your best</th>
                    <th className="px-3 py-2">Session entries</th>
                    <th className="px-3 py-2">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {tracks.map((t) => (
                    <tr key={String(t.id)} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-3 py-2">
                        <div className="font-medium">{String(t.name)}</div>
                        <div className="mono text-xs muted">By {String(t.created_by)}</div>
                      </td>
                      <td className="px-3 py-2">{t.location ? String(t.location) : '—'}</td>
                      <td className="px-3 py-2 mono">{formatLapMs(t.best_lap_ms)}</td>
                      <td className="px-3 py-2 mono">{formatLapMs(myBestByTrack.get(String(t.id)) ?? null)}</td>
                      <td className="px-3 py-2 mono">{Number(t.laps_count) || 0}</td>
                      <td className="px-3 py-2">
                        <Link className="btn" href={`/league/${league.code}/karting/${String(t.id)}`}>
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
