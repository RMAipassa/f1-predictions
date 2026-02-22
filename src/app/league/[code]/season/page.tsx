import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLeagueByCode } from '@/lib/league';
import { db } from '@/lib/db';
import LiveUpdates from '@/components/LiveUpdates';
import UniqueRankedSelects from '@/components/UniqueRankedSelects';

const WDC_SLOTS = 22;
const WCC_SLOTS = 11;

export default async function LeagueSeasonPredictionsPage({ params }: { params: Promise<{ code: string }> }) {
  const p = await params;
  const { league, user } = await getLeagueByCode(p.code);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/league/${p.code}/season`)}`);
  if (!league) return notFound();

  const seasonYear = new Date().getUTCFullYear();

  const drivers = db()
    .prepare('select driver_id, given_name, family_name, code from drivers order by family_name asc')
    .all() as any[];
  const constructors = db().prepare('select constructor_id, name from constructors order by name asc').all() as any[];
  const race1 = db().prepare('select race_start from races where season_year = ? and round = 1').get(seasonYear) as any;
  const predRow = db()
    .prepare(
      'select wdc_json, wcc_json, random_json, submitted_at from season_predictions where league_id = ? and user_id = ? and season_year = ?'
    )
    .get(String(league.id), user.id, seasonYear) as any;

  const pred = predRow
    ? {
        wdc: JSON.parse(String(predRow.wdc_json || '{}')),
        wcc: JSON.parse(String(predRow.wcc_json || '{}')),
        random: JSON.parse(String(predRow.random_json || '{}')),
        submitted_at: String(predRow.submitted_at),
      }
    : null;

  const lockAt = race1?.race_start ? new Date(String(race1.race_start)) : null;
  const locked = lockAt ? lockAt.getTime() <= Date.now() : false;
  const canViewOthers = locked || String(league.owner_id) === user.id;

  const driverLabelById = new Map<string, string>();
  for (const d of drivers ?? []) {
    driverLabelById.set(
      String(d.driver_id),
      `${d.family_name}, ${d.given_name}${d.code ? ` (${d.code})` : ''}`
    );
  }
  const constructorLabelById = new Map<string, string>();
  for (const c of constructors ?? []) constructorLabelById.set(String(c.constructor_id), String(c.name));

  const memberSeason = canViewOthers
    ? (db()
        .prepare(
          `select
             lm.user_id,
             u.nickname,
             sp.wdc_json,
             sp.wcc_json,
             sp.random_json,
             sp.submitted_at
           from league_members lm
           join users u on u.id = lm.user_id
           left join season_predictions sp
             on sp.league_id = lm.league_id
            and sp.user_id = lm.user_id
            and sp.season_year = ?
           where lm.league_id = ?
           order by u.nickname asc`
        )
        .all(seasonYear, String(league.id)) as any[])
    : [];

  async function save(formData: FormData) {
    'use server';

    const { league: freshLeague, user: freshUser } = await getLeagueByCode(p.code);
    if (!freshLeague || !freshUser) return;

    const freshRace1 = db().prepare('select race_start from races where season_year = ? and round = 1').get(seasonYear) as any;
    const freshLockAt = freshRace1?.race_start ? new Date(String(freshRace1.race_start)) : null;
    if (freshLockAt && freshLockAt.getTime() <= Date.now()) return;

    const wdc: Record<string, string> = {};
    const wcc: Record<string, string> = {};
    const random: Record<string, string> = {};

    for (let i = 1; i <= WDC_SLOTS; i++) {
      const v = String(formData.get(`wdc_p${i}`) ?? '').trim();
      if (v) wdc[`p${i}`] = v;
    }
    for (let i = 1; i <= WCC_SLOTS; i++) {
      const v = String(formData.get(`wcc_p${i}`) ?? '').trim();
      if (v) wcc[`p${i}`] = v;
    }
    for (let i = 1; i <= 5; i++) {
      const v = String(formData.get(`random_${i}`) ?? '').trim();
      if (v) random[`r${i}`] = v;
    }

    db().prepare('insert or ignore into seasons (year) values (?)').run(seasonYear);
    db().prepare(
      `insert into season_predictions (league_id, user_id, season_year, wdc_json, wcc_json, random_json, submitted_at)
       values (@league_id, @user_id, @season_year, @wdc_json, @wcc_json, @random_json, @submitted_at)
       on conflict (league_id, user_id, season_year) do update set
         wdc_json=excluded.wdc_json,
         wcc_json=excluded.wcc_json,
         random_json=excluded.random_json,
         submitted_at=excluded.submitted_at`
    ).run({
      league_id: String(freshLeague.id),
      user_id: freshUser.id,
      season_year: seasonYear,
      wdc_json: JSON.stringify(wdc),
      wcc_json: JSON.stringify(wcc),
      random_json: JSON.stringify(random),
      submitted_at: new Date().toISOString(),
    });
  }

  return (
    <main className="app-bg">
      <LiveUpdates />
      <div className="shell">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-xs muted">Season {seasonYear}</div>
            <h1 className="text-5xl leading-none h-display">Season Predictions</h1>
            <div className="mt-2 text-sm muted">
              Lock: <span className="mono">{lockAt ? lockAt.toLocaleString() : 'Round 1 TBD'}</span> ({locked ? 'locked' : 'open'})
            </div>
          </div>
          <Link className="btn" href={`/league/${league.code}`}>
            Back
          </Link>
        </div>

        <form action={save} className="mt-8 grid gap-6">
          <section className="card-solid p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-2xl h-display">WDC</h2>
              <div className="mono text-xs muted">+1 PER EXACT SPOT</div>
            </div>
            <div className="mt-4">
              <UniqueRankedSelects
                prefix="wdc_p"
                slots={WDC_SLOTS}
                disabled={locked}
                options={drivers.map((d: any) => ({
                  value: d.driver_id,
                  label: `${d.family_name}, ${d.given_name}${d.code ? ` (${d.code})` : ''}`,
                }))}
                initial={Object.fromEntries(
                  Array.from({ length: WDC_SLOTS }).map((_, i) => {
                    const p = i + 1;
                    return [`wdc_p${p}`, (pred?.wdc as any)?.[`p${p}`] ?? ''];
                  })
                )}
              />
            </div>
          </section>

          <section className="card-solid p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-2xl h-display">WCC</h2>
              <div className="mono text-xs muted">+1 PER EXACT SPOT</div>
            </div>
            <div className="mt-4">
              <UniqueRankedSelects
                prefix="wcc_p"
                slots={WCC_SLOTS}
                disabled={locked}
                options={constructors.map((c: any) => ({ value: c.constructor_id, label: c.name }))}
                initial={Object.fromEntries(
                  Array.from({ length: WCC_SLOTS }).map((_, i) => {
                    const p = i + 1;
                    return [`wcc_p${p}`, (pred?.wcc as any)?.[`p${p}`] ?? ''];
                  })
                )}
              />
            </div>
          </section>

          <section className="card-solid p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-2xl h-display">Random</h2>
              <div className="mono text-xs muted">MANUAL: 8/6/4/2/1</div>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3">
            {[
              { i: 1, pts: 8 },
              { i: 2, pts: 6 },
              { i: 3, pts: 4 },
              { i: 4, pts: 2 },
              { i: 5, pts: 1 },
            ].map(({ i, pts }) => (
              <label key={i} className="block">
                <div className="text-sm font-semibold">Prediction {i} ({pts}pt)</div>
                <input
                  className="mt-1 w-full field"
                  name={`random_${i}`}
                  defaultValue={(pred?.random as any)?.[`r${i}`] ?? ''}
                  disabled={locked}
                />
              </label>
            ))}
          </div>

          <div className="mt-4 text-sm muted">
            League owner reviews these in{' '}
            <Link className="underline underline-offset-4" href={`/league/${league.code}/season/review`}>
              Random review
            </Link>
            .
          </div>
        </section>

          <button className={`btn ${locked ? '' : 'btn-primary'} disabled:opacity-50`} type="submit" disabled={locked}>
            {locked ? 'Locked' : 'Save season predictions'}
          </button>
        </form>

        <div className="mt-10 card-solid p-5">
          <div className="flex items-baseline justify-between gap-3">
            <div className="font-semibold">Other predictions</div>
            <div className="mono text-xs muted">{canViewOthers ? 'VISIBLE' : 'LOCKED'}</div>
          </div>

          {!canViewOthers ? (
            <div className="mt-2 text-sm muted">Other season picks become visible once the season locks.</div>
          ) : (
            <div className="mt-4 grid gap-3">
              {memberSeason
                .filter((m) => String(m.user_id) !== user.id)
                .map((m) => {
                  const wdc = m.wdc_json ? JSON.parse(String(m.wdc_json)) : {};
                  const wcc = m.wcc_json ? JSON.parse(String(m.wcc_json)) : {};
                  const random = m.random_json ? JSON.parse(String(m.random_json)) : {};

                  const wdcTop = Array.from({ length: 10 }).map((_, i) => {
                    const p = i + 1;
                    const id = (wdc as any)[`p${p}`];
                    return id ? driverLabelById.get(String(id)) ?? String(id) : '—';
                  });

                  const wccTop = Array.from({ length: Math.min(5, WCC_SLOTS) }).map((_, i) => {
                    const p = i + 1;
                    const id = (wcc as any)[`p${p}`];
                    return id ? constructorLabelById.get(String(id)) ?? String(id) : '—';
                  });

                  return (
                    <details key={m.user_id} className="card p-4">
                      <summary className="cursor-pointer list-none">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-lg font-semibold">{m.nickname}</div>
                            <div className="mt-1 text-sm muted">
                              WDC top 3: <span className="mono">{wdcTop.slice(0, 3).join(' / ')}</span>
                            </div>
                          </div>
                          <div className="mono text-xs muted">{m.submitted_at ? 'SUBMITTED' : '—'}</div>
                        </div>
                      </summary>

                      <div className="mt-4 grid gap-4">
                        <div>
                          <div className="mono text-xs muted">WDC (Top 10)</div>
                          <div className="mt-2 grid gap-1 text-sm">
                            {wdcTop.map((label, idx) => (
                              <div key={idx}>
                                <span className="mono muted">P{idx + 1}</span> {label}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="mono text-xs muted">WCC (Top 5)</div>
                          <div className="mt-2 grid gap-1 text-sm">
                            {wccTop.map((label, idx) => (
                              <div key={idx}>
                                <span className="mono muted">P{idx + 1}</span> {label}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <div className="mono text-xs muted">Random</div>
                          <div className="mt-2 grid gap-1 text-sm">
                            {[1, 2, 3, 4, 5].map((i) => (
                              <div key={i}>
                                <span className="mono muted">R{i}</span> {(random as any)[`r${i}`] ?? '—'}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </details>
                  );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
