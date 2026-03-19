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

function parseLapTimeToMs(raw: string) {
  const value = raw.trim();
  if (!value) return null;

  if (value.includes(':')) {
    const [mRaw, sRaw] = value.split(':');
    const m = Number(mRaw);
    const s = Number(sRaw);
    if (!Number.isFinite(m) || !Number.isFinite(s) || m < 0 || s < 0 || s >= 60) return null;
    return Math.round((m * 60 + s) * 1000);
  }

  const sec = Number(value);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return Math.round(sec * 1000);
}

export default async function KartTrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string; trackId: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const p = await params;
  const sp = await searchParams;
  const { league, user } = await getLeagueByCode(p.code);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/league/${p.code}/karting/${p.trackId}`)}`);
  if (!league) return notFound();

  const track = db()
    .prepare('select id, league_id, name, location, created_at from kart_tracks where id = ? and league_id = ?')
    .get(String(p.trackId), String(league.id)) as any;
  if (!track) return notFound();

  const rangeRaw = String(sp.range ?? '90');
  const rangeDays = rangeRaw === '30' ? 30 : rangeRaw === '365' ? 365 : rangeRaw === 'all' ? 0 : 90;
  const cutoffIso =
    rangeDays > 0
      ? new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const bestByUser = db()
    .prepare(
      `select u.id as user_id, u.nickname, min(ktt.lap_ms) as best_lap_ms, count(*) as laps_count, max(ktt.created_at) as last_entry_at
       from kart_track_times ktt
       join users u on u.id = ktt.user_id
       where ktt.track_id = ?
       group by u.id, u.nickname
       order by best_lap_ms asc, u.nickname asc`
    )
    .all(String(track.id)) as any[];

  const recentEntries = db()
    .prepare(
      `select ktt.id, ktt.user_id, u.nickname, ktt.session_label, ktt.lap_ms, ktt.session_at, ktt.note, ktt.created_at
       from kart_track_times ktt
       join users u on u.id = ktt.user_id
       where ktt.track_id = ?
       order by coalesce(ktt.session_at, ktt.created_at) desc
       limit 40`
    )
    .all(String(track.id)) as any[];

  const sessionRows = cutoffIso
    ? (db()
        .prepare(
          `select ktt.user_id, u.nickname, ktt.session_label, ktt.lap_ms, ktt.session_at, ktt.created_at, ktt.note
           from kart_track_times ktt
           join users u on u.id = ktt.user_id
           where ktt.track_id = ? and coalesce(ktt.session_at, ktt.created_at) >= ?
           order by coalesce(ktt.session_at, ktt.created_at) desc, ktt.lap_ms asc`
        )
        .all(String(track.id), cutoffIso) as any[])
    : (db()
        .prepare(
          `select ktt.user_id, u.nickname, ktt.session_label, ktt.lap_ms, ktt.session_at, ktt.created_at, ktt.note
           from kart_track_times ktt
           join users u on u.id = ktt.user_id
           where ktt.track_id = ?
           order by coalesce(ktt.session_at, ktt.created_at) desc, ktt.lap_ms asc`
        )
        .all(String(track.id)) as any[]);

  const sessionHistory = new Map<string, { at: string; entries: any[] }>();
  for (const row of sessionRows ?? []) {
    const sessionLabel = String(row.session_label || 'Unlabeled session');
    const at = String(row.session_at || row.created_at);
    const cur = sessionHistory.get(sessionLabel);
    if (!cur) {
      sessionHistory.set(sessionLabel, { at, entries: [row] });
    } else {
      cur.entries.push(row);
      if (new Date(at).getTime() > new Date(cur.at).getTime()) cur.at = at;
    }
  }

  const sessionGroups = Array.from(sessionHistory.entries())
    .map(([label, value]) => ({ label, at: value.at, entries: value.entries }))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 30);

  const trendRows = cutoffIso
    ? (db()
        .prepare(
          `select ktt.user_id, u.nickname, ktt.lap_ms, coalesce(ktt.session_at, ktt.created_at) as at_ts
           from kart_track_times ktt
           join users u on u.id = ktt.user_id
           where ktt.track_id = ? and coalesce(ktt.session_at, ktt.created_at) >= ?
           order by at_ts asc`
        )
        .all(String(track.id), cutoffIso) as any[])
    : (db()
        .prepare(
          `select ktt.user_id, u.nickname, ktt.lap_ms, coalesce(ktt.session_at, ktt.created_at) as at_ts
           from kart_track_times ktt
           join users u on u.id = ktt.user_id
           where ktt.track_id = ?
           order by at_ts asc`
        )
        .all(String(track.id)) as any[]);

  const trendByUser = new Map<string, { nickname: string; points: Array<{ t: number; ms: number }> }>();
  for (const row of trendRows ?? []) {
    const uid = String(row.user_id);
    const t = new Date(String(row.at_ts)).getTime();
    const ms = Number(row.lap_ms);
    if (!Number.isFinite(t) || !Number.isFinite(ms) || ms <= 0) continue;
    const cur = trendByUser.get(uid);
    if (!cur) {
      trendByUser.set(uid, { nickname: String(row.nickname), points: [{ t, ms }] });
    } else {
      cur.points.push({ t, ms });
    }
  }

  const allTrendPoints = Array.from(trendByUser.values()).flatMap((v) => v.points);
  const chart = (() => {
    if (allTrendPoints.length < 2) return null;

    const minT = Math.min(...allTrendPoints.map((p) => p.t));
    const maxT = Math.max(...allTrendPoints.map((p) => p.t));
    const minMs = Math.min(...allTrendPoints.map((p) => p.ms));
    const maxMs = Math.max(...allTrendPoints.map((p) => p.ms));
    const width = 900;
    const height = 260;
    const padX = 36;
    const padY = 18;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;

    const x = (t: number) => {
      if (maxT === minT) return padX + innerW / 2;
      return padX + ((t - minT) / (maxT - minT)) * innerW;
    };
    const y = (ms: number) => {
      if (maxMs === minMs) return padY + innerH / 2;
      return padY + ((maxMs - ms) / (maxMs - minMs)) * innerH;
    };

    const palette = ['#0f766e', '#0369a1', '#b45309', '#be123c', '#4f46e5', '#166534', '#7c3aed', '#334155'];
    const series = Array.from(trendByUser.entries())
      .map(([uid, v], i) => ({ uid, nickname: v.nickname, color: palette[i % palette.length], points: v.points }))
      .filter((s) => s.points.length > 0)
      .sort((a, b) => a.nickname.localeCompare(b.nickname));

    return {
      width,
      height,
      minMs,
      maxMs,
      series: series.map((s) => ({
        ...s,
        path: s.points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${x(p.t).toFixed(2)} ${y(p.ms).toFixed(2)}`).join(' '),
        circles: s.points.map((p) => ({ cx: x(p.t), cy: y(p.ms) })),
      })),
    };
  })();

  const myBest = db()
    .prepare('select min(lap_ms) as best_lap_ms, count(*) as laps_count from kart_track_times where track_id = ? and user_id = ?')
    .get(String(track.id), user.id) as any;

  async function addLapTime(formData: FormData) {
    'use server';

    const { league: freshLeague, user: freshUser } = await getLeagueByCode(p.code);
    if (!freshLeague || !freshUser) return;

    const freshTrack = db()
      .prepare('select id from kart_tracks where id = ? and league_id = ?')
      .get(String(p.trackId), String(freshLeague.id)) as any;
    if (!freshTrack) return;

    const lapRaw = String(formData.get('best_time') ?? '');
    const sessionLabel = String(formData.get('session_label') ?? '').trim();
    const lapMs = parseLapTimeToMs(lapRaw);
    const note = String(formData.get('note') ?? '').trim();
    const sessionAtRaw = String(formData.get('session_at') ?? '').trim();

    if (!lapMs || lapMs < 10000 || lapMs > 600000) return;
    if (sessionLabel.length < 2 || sessionLabel.length > 80) return;
    if (note.length > 140) return;

    const sessionAt = sessionAtRaw ? new Date(sessionAtRaw).toISOString() : null;

    db()
      .prepare(
        `insert into kart_track_times (id, track_id, user_id, session_label, lap_ms, session_at, note, created_at)
         values (?,?,?,?,?,?,?,?)
         on conflict (track_id, user_id, session_label) do update set
           lap_ms = min(kart_track_times.lap_ms, excluded.lap_ms),
           session_at = coalesce(excluded.session_at, kart_track_times.session_at),
           note = coalesce(excluded.note, kart_track_times.note),
           created_at = excluded.created_at`
      )
      .run(
        crypto.randomBytes(12).toString('hex'),
        String(p.trackId),
        freshUser.id,
        sessionLabel,
        lapMs,
        sessionAt,
        note || null,
        new Date().toISOString()
      );

    redirect(`/league/${p.code}/karting/${p.trackId}`);
  }

  async function removeEntry(formData: FormData) {
    'use server';

    const { league: freshLeague, user: freshUser } = await getLeagueByCode(p.code);
    if (!freshLeague || !freshUser) return;

    const entryId = String(formData.get('entry_id') ?? '');
    if (!entryId) return;

    db()
      .prepare(
        `delete from kart_track_times
         where id = ?
           and user_id = ?
           and track_id in (select id from kart_tracks where id = ? and league_id = ?)`
      )
      .run(entryId, freshUser.id, String(p.trackId), String(freshLeague.id));

    redirect(`/league/${p.code}/karting/${p.trackId}`);
  }

  return (
    <main className="app-bg">
      <div className="shell">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-xs muted">Karting Track</div>
            <h1 className="text-5xl leading-none h-display">{String(track.name)}</h1>
            <div className="mt-2 text-sm muted">{track.location ? String(track.location) : 'Location not set'}</div>
          </div>
          <div className="flex gap-2">
            <Link className="btn" href={`/league/${league.code}/leaderboard`}>
              League points
            </Link>
            <Link className="btn" href={`/league/${league.code}/karting`}>
              Back to tracks
            </Link>
          </div>
        </div>

        <section className="mt-8 grid gap-3 md:grid-cols-2">
          <div className="card-solid p-5">
            <div className="mono text-xs muted">YOUR STATS</div>
            <div className="mt-2 text-sm">
              <div>
                Best lap: <span className="mono">{formatLapMs(myBest?.best_lap_ms)}</span>
              </div>
              <div className="mt-1">
                Session bests: <span className="mono">{Number(myBest?.laps_count) || 0}</span>
              </div>
            </div>
          </div>

          <div className="card-solid p-5">
            <div className="text-lg font-semibold">Add your session best</div>
            <form action={addLapTime} className="mt-3 grid gap-3">
              <input className="field" type="text" name="session_label" placeholder="Session label (e.g. 2026-03-19 Evening)" required maxLength={80} />
              <input className="field" type="text" name="best_time" placeholder="Best lap (e.g. 1:02.345 or 62.345)" required />
              <input className="field" type="datetime-local" name="session_at" />
              <input className="field" type="text" name="note" maxLength={140} placeholder="Notes (kart class, weather, etc.)" />
              <button className="btn btn-primary" type="submit">Save session best</button>
            </form>
            <div className="mt-2 text-xs muted">If you save the same session label again, only your fastest time is kept.</div>
          </div>
        </section>

        <section className="mt-6 card-solid p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-lg font-semibold">Personal best leaderboard</div>
            <div className="mono text-xs muted">{bestByUser.length} drivers</div>
          </div>
          {bestByUser.length === 0 ? (
            <div className="mt-3 text-sm muted">No lap times yet.</div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left" style={{ background: 'rgba(16, 19, 24, 0.03)' }}>
                  <tr>
                    <th className="px-3 py-2">Pos</th>
                    <th className="px-3 py-2">Driver</th>
                    <th className="px-3 py-2">Best lap</th>
                    <th className="px-3 py-2">Entries</th>
                    <th className="px-3 py-2">Last entry</th>
                  </tr>
                </thead>
                <tbody>
                  {bestByUser.map((r, i) => (
                    <tr key={String(r.user_id)} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-3 py-2 mono">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{String(r.nickname)}</td>
                      <td className="px-3 py-2 mono">{formatLapMs(r.best_lap_ms)}</td>
                      <td className="px-3 py-2 mono">{Number(r.laps_count) || 0}</td>
                      <td className="px-3 py-2 mono">{r.last_entry_at ? new Date(String(r.last_entry_at)).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 card-solid p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-lg font-semibold">Time trend</div>
            <div className="flex gap-2">
              {[
                { key: '30', label: '30d' },
                { key: '90', label: '90d' },
                { key: '365', label: '1y' },
                { key: 'all', label: 'All' },
              ].map((r) => (
                <Link
                  key={r.key}
                  className={`btn ${rangeRaw === r.key ? 'btn-primary' : ''}`}
                  href={`/league/${league.code}/karting/${track.id}?range=${r.key}`}
                >
                  {r.label}
                </Link>
              ))}
            </div>
          </div>

          {chart ? (
            <div className="mt-4 overflow-x-auto">
              <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="w-full min-w-[700px]" role="img" aria-label="Session best trend chart">
                <rect x="0" y="0" width={chart.width} height={chart.height} fill="transparent" />
                <line x1="36" y1="18" x2="36" y2="242" stroke="var(--border)" strokeWidth="1" />
                <line x1="36" y1="242" x2="864" y2="242" stroke="var(--border)" strokeWidth="1" />
                <text x="42" y="28" fontSize="11" fill="var(--muted)">{formatLapMs(chart.maxMs)}</text>
                <text x="42" y="238" fontSize="11" fill="var(--muted)">{formatLapMs(chart.minMs)}</text>
                {chart.series.map((s) => (
                  <g key={s.uid}>
                    <path d={s.path} fill="none" stroke={s.color} strokeWidth="2" />
                    {s.circles.map((c, i) => (
                      <circle key={`${s.uid}:${i}`} cx={c.cx} cy={c.cy} r="2.8" fill={s.color} />
                    ))}
                  </g>
                ))}
              </svg>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                {chart.series.map((s) => (
                  <div key={`legend:${s.uid}`} className="flex items-center gap-2">
                    <span style={{ background: s.color, width: 10, height: 10, display: 'inline-block', borderRadius: 2 }} />
                    <span>{s.nickname}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-3 text-sm muted">Need at least 2 data points in this range to draw the graph.</div>
          )}
        </section>

        <section className="mt-6 card-solid p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-lg font-semibold">Session history</div>
            <div className="mono text-xs muted">{sessionGroups.length} sessions</div>
          </div>

          {sessionGroups.length === 0 ? (
            <div className="mt-3 text-sm muted">No sessions in this time range.</div>
          ) : (
            <div className="mt-4 grid gap-3">
              {sessionGroups.map((s) => (
                <div key={`${s.label}:${s.at}`} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{s.label}</div>
                      <div className="mt-1 mono text-xs muted">{new Date(s.at).toLocaleString()}</div>
                    </div>
                    <div className="mono text-xs muted">{s.entries.length} entries</div>
                  </div>
                  <div className="mt-3 grid gap-1 text-sm">
                    {s.entries
                      .slice()
                      .sort((a, b) => Number(a.lap_ms) - Number(b.lap_ms))
                      .map((e) => (
                        <div key={`${s.label}:${e.user_id}`} className="flex items-center justify-between gap-3">
                          <span>{String(e.nickname)}</span>
                          <span className="mono">{formatLapMs(e.lap_ms)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="mt-6 card-solid p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-lg font-semibold">Recent session bests</div>
            <div className="mono text-xs muted">Latest {recentEntries.length}</div>
          </div>

          {recentEntries.length === 0 ? (
            <div className="mt-3 text-sm muted">No entries yet.</div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left" style={{ background: 'rgba(16, 19, 24, 0.03)' }}>
                  <tr>
                    <th className="px-3 py-2">Driver</th>
                    <th className="px-3 py-2">Session label</th>
                    <th className="px-3 py-2">Lap</th>
                    <th className="px-3 py-2">Session</th>
                    <th className="px-3 py-2">Notes</th>
                    <th className="px-3 py-2">Saved</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentEntries.map((e) => {
                    const mine = String(e.user_id) === user.id;
                    return (
                      <tr key={String(e.id)} className="border-t" style={{ borderColor: 'var(--border)' }}>
                        <td className="px-3 py-2 font-medium">{String(e.nickname)}</td>
                        <td className="px-3 py-2">{e.session_label ? String(e.session_label) : '—'}</td>
                        <td className="px-3 py-2 mono">{formatLapMs(e.lap_ms)}</td>
                        <td className="px-3 py-2 mono">{e.session_at ? new Date(String(e.session_at)).toLocaleString() : '—'}</td>
                        <td className="px-3 py-2">{e.note ? String(e.note) : '—'}</td>
                        <td className="px-3 py-2 mono">{new Date(String(e.created_at)).toLocaleString()}</td>
                        <td className="px-3 py-2">
                          {mine ? (
                            <form action={removeEntry}>
                              <input type="hidden" name="entry_id" value={String(e.id)} />
                              <button className="btn" type="submit">Remove</button>
                            </form>
                          ) : (
                            <span className="mono text-xs muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
