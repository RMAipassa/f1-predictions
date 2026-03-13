import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getLeagueByCode } from '@/lib/league';
import { db } from '@/lib/db';
import LiveUpdates from '@/components/LiveUpdates';
import UniqueRaceSelects from '@/components/UniqueRaceSelects';

function scoreRacePick(pred: any, result: any) {
  if (!pred || !result) {
    return {
      points: 0,
      breakdown: { pole: 0, p1: 0, p2: 0, p3: 0, sprintPole: 0, sprintP1: 0, sprintP2: 0, sprintP3: 0 },
    };
  }
  const pole = pred.pole_driver_id && result.pole_driver_id && pred.pole_driver_id === result.pole_driver_id ? 1 : 0;
  const p1 = pred.p1_driver_id && result.p1_driver_id && pred.p1_driver_id === result.p1_driver_id ? 1 : 0;
  const p2 = pred.p2_driver_id && result.p2_driver_id && pred.p2_driver_id === result.p2_driver_id ? 1 : 0;
  const p3 = pred.p3_driver_id && result.p3_driver_id && pred.p3_driver_id === result.p3_driver_id ? 1 : 0;
  const sprintPole =
    pred.sprint_pole_driver_id && result.sprint_pole_driver_id && pred.sprint_pole_driver_id === result.sprint_pole_driver_id ? 1 : 0;
  const sprintP1 = pred.sprint_p1_driver_id && result.sprint_p1_driver_id && pred.sprint_p1_driver_id === result.sprint_p1_driver_id ? 1 : 0;
  const sprintP2 = pred.sprint_p2_driver_id && result.sprint_p2_driver_id && pred.sprint_p2_driver_id === result.sprint_p2_driver_id ? 1 : 0;
  const sprintP3 = pred.sprint_p3_driver_id && result.sprint_p3_driver_id && pred.sprint_p3_driver_id === result.sprint_p3_driver_id ? 1 : 0;
  const points = pole + p1 + p2 + p3 + sprintPole + sprintP1 + sprintP2 + sprintP3;
  return { points, breakdown: { pole, p1, p2, p3, sprintPole, sprintP1, sprintP2, sprintP3 } };
}

export default async function RaceRoundPage({ params }: { params: Promise<{ code: string; round: string }> }) {
  const p = await params;
  const round = Number(p.round);
  if (!Number.isFinite(round)) return notFound();

  const selfHref = `/league/${p.code}/races/${p.round}`;

  const { league, user } = await getLeagueByCode(p.code);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/league/${p.code}/races/${p.round}`)}`);
  if (!league) return notFound();

  const seasonYear = new Date().getUTCFullYear();

  const race = db()
    .prepare(
      'select season_year, round, name, quali_start, sprint_quali_start, sprint_race_start, race_start from races where season_year = ? and round = ?'
    )
    .get(seasonYear, round) as any;
  const drivers = db()
    .prepare('select driver_id, given_name, family_name, code from drivers order by family_name asc')
    .all() as any[];
  const pred = db()
    .prepare(
      `select pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id,
              sprint_pole_driver_id, sprint_p1_driver_id, sprint_p2_driver_id, sprint_p3_driver_id,
              submitted_at
       from race_predictions
       where league_id = ? and user_id = ? and season_year = ? and round = ?`
    )
    .get(String(league.id), user.id, seasonYear, round) as any;
  const result = db()
    .prepare(
      `select pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id,
              sprint_pole_driver_id, sprint_p1_driver_id, sprint_p2_driver_id, sprint_p3_driver_id,
              fetched_at
       from race_results
       where season_year = ? and round = ?`
    )
    .get(seasonYear, round) as any;

  if (!race) return notFound();

  const now = Date.now();

  const unlockRows = db()
    .prepare(
      'select prediction_key, is_enabled from prediction_unlock_overrides where league_id = ? and season_year = ? and round = ? and is_enabled = 1'
    )
    .all(String(league.id), seasonYear, round) as any[];
  const unlockSet = new Set(unlockRows.map((r) => String(r.prediction_key)));

  const raceLockAt = race.race_start ? new Date(race.race_start) : null;
  const qualiLockAt = race.quali_start ? new Date(race.quali_start) : raceLockAt;
  const hasSprintWeekend = Boolean(race.sprint_race_start || race.sprint_quali_start);
  const sprintRaceLockAt = race.sprint_race_start ? new Date(race.sprint_race_start) : raceLockAt;
  const sprintQualiLockAt = race.sprint_quali_start ? new Date(race.sprint_quali_start) : sprintRaceLockAt;

  const poleLocked = (qualiLockAt ? qualiLockAt.getTime() <= now : false) && !unlockSet.has('race_pole');
  const raceLocked = (raceLockAt ? raceLockAt.getTime() <= now : false) && !unlockSet.has('race_podium');
  const sprintPoleLocked =
    !hasSprintWeekend || ((sprintQualiLockAt ? sprintQualiLockAt.getTime() <= now : false) && !unlockSet.has('sprint_pole'));
  const sprintRaceLocked =
    !hasSprintWeekend || ((sprintRaceLockAt ? sprintRaceLockAt.getTime() <= now : false) && !unlockSet.has('sprint_podium'));
  const fullyLocked = poleLocked && raceLocked && sprintPoleLocked && sprintRaceLocked;

  const scoring = result ? scoreRacePick(pred, result) : null;
  const canViewOthers = (raceLockAt ? raceLockAt.getTime() <= now : false) || String(league.owner_id) === user.id;

  const driverLabelById = new Map<string, string>();
  for (const d of drivers ?? []) {
    driverLabelById.set(
      String(d.driver_id),
      `${d.family_name}, ${d.given_name}${d.code ? ` (${d.code})` : ''}`
    );
  }

  const allPicks = canViewOthers
    ? (db()
        .prepare(
          `select
             lm.user_id,
             u.nickname,
              rp.pole_driver_id,
              rp.p1_driver_id,
              rp.p2_driver_id,
              rp.p3_driver_id,
              rp.sprint_pole_driver_id,
              rp.sprint_p1_driver_id,
              rp.sprint_p2_driver_id,
              rp.sprint_p3_driver_id,
              rp.submitted_at
           from league_members lm
           join users u on u.id = lm.user_id
           left join race_predictions rp
             on rp.league_id = lm.league_id
            and rp.user_id = lm.user_id
            and rp.season_year = ?
            and rp.round = ?
           where lm.league_id = ?
           order by u.nickname asc`
        )
        .all(seasonYear, round, String(league.id)) as any[])
    : [];

  async function save(formData: FormData) {
    'use server';

    const { league: freshLeague, user: freshUser } = await getLeagueByCode(p.code);
    if (!freshLeague || !freshUser) return;

    const freshRace = db()
      .prepare('select quali_start, sprint_quali_start, sprint_race_start, race_start from races where season_year = ? and round = ?')
      .get(seasonYear, round) as any;

    const unlockRows = db()
      .prepare(
        'select prediction_key, is_enabled from prediction_unlock_overrides where league_id = ? and season_year = ? and round = ? and is_enabled = 1'
      )
      .all(String(freshLeague.id), seasonYear, round) as any[];
    const unlockSet = new Set(unlockRows.map((r) => String(r.prediction_key)));

    const now = Date.now();
    const raceLockAt = freshRace?.race_start ? new Date(String(freshRace.race_start)) : null;
    const qualiLockAt = freshRace?.quali_start ? new Date(String(freshRace.quali_start)) : raceLockAt;
    const hasSprintWeekend = Boolean(freshRace?.sprint_race_start || freshRace?.sprint_quali_start);
    const sprintRaceLockAt = freshRace?.sprint_race_start ? new Date(String(freshRace.sprint_race_start)) : raceLockAt;
    const sprintQualiLockAt = freshRace?.sprint_quali_start ? new Date(String(freshRace.sprint_quali_start)) : sprintRaceLockAt;

    const poleLocked = (qualiLockAt ? qualiLockAt.getTime() <= now : false) && !unlockSet.has('race_pole');
    const raceLocked = (raceLockAt ? raceLockAt.getTime() <= now : false) && !unlockSet.has('race_podium');
    const sprintPoleLocked =
      !hasSprintWeekend || ((sprintQualiLockAt ? sprintQualiLockAt.getTime() <= now : false) && !unlockSet.has('sprint_pole'));
    const sprintRaceLocked =
      !hasSprintWeekend || ((sprintRaceLockAt ? sprintRaceLockAt.getTime() <= now : false) && !unlockSet.has('sprint_podium'));
    if (poleLocked && raceLocked && sprintPoleLocked && sprintRaceLocked) redirect(selfHref);

    const existing = db()
      .prepare(
        `select pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id,
                sprint_pole_driver_id, sprint_p1_driver_id, sprint_p2_driver_id, sprint_p3_driver_id
         from race_predictions
         where league_id = ? and user_id = ? and season_year = ? and round = ?`
      )
      .get(String(freshLeague.id), freshUser.id, seasonYear, round) as any;

    const validDriverIds = new Set(
      ((db().prepare('select driver_id from drivers').all() as any[]) ?? []).map((d: any) => String(d.driver_id))
    );

    const cleanDriver = (value: unknown) => {
      const id = String(value ?? '').trim();
      if (!id) return null;
      return validDriverIds.has(id) ? id : null;
    };

    const requestedPolePick = String(formData.get('pole_driver_id') ?? '').trim();
    const requestedSprintPolePick = hasSprintWeekend ? String(formData.get('sprint_pole_driver_id') ?? '').trim() : '';
    if (!poleLocked && requestedPolePick && !validDriverIds.has(requestedPolePick)) redirect(selfHref);
    if (!sprintPoleLocked && requestedSprintPolePick && !validDriverIds.has(requestedSprintPolePick)) redirect(selfHref);

    const poleDriverId = poleLocked ? cleanDriver(existing?.pole_driver_id) : cleanDriver(formData.get('pole_driver_id'));
    const p1DriverId = raceLocked ? cleanDriver(existing?.p1_driver_id) : cleanDriver(formData.get('p1_driver_id'));
    const p2DriverId = raceLocked ? cleanDriver(existing?.p2_driver_id) : cleanDriver(formData.get('p2_driver_id'));
    const p3DriverId = raceLocked ? cleanDriver(existing?.p3_driver_id) : cleanDriver(formData.get('p3_driver_id'));
    const sprintPoleDriverId = sprintPoleLocked
      ? cleanDriver(existing?.sprint_pole_driver_id)
      : hasSprintWeekend
      ? cleanDriver(formData.get('sprint_pole_driver_id'))
      : null;
    const sprintP1DriverId = sprintRaceLocked
      ? cleanDriver(existing?.sprint_p1_driver_id)
      : hasSprintWeekend
      ? cleanDriver(formData.get('sprint_p1_driver_id'))
      : null;
    const sprintP2DriverId = sprintRaceLocked
      ? cleanDriver(existing?.sprint_p2_driver_id)
      : hasSprintWeekend
      ? cleanDriver(formData.get('sprint_p2_driver_id'))
      : null;
    const sprintP3DriverId = sprintRaceLocked
      ? cleanDriver(existing?.sprint_p3_driver_id)
      : hasSprintWeekend
      ? cleanDriver(formData.get('sprint_p3_driver_id'))
      : null;

    const requestedRacePicks = [
      String(formData.get('p1_driver_id') ?? '').trim(),
      String(formData.get('p2_driver_id') ?? '').trim(),
      String(formData.get('p3_driver_id') ?? '').trim(),
    ].filter(Boolean);
    if (!raceLocked && requestedRacePicks.some((id) => !validDriverIds.has(id))) redirect(selfHref);

    const requestedSprintRacePicks = hasSprintWeekend
      ? [
      String(formData.get('sprint_p1_driver_id') ?? '').trim(),
      String(formData.get('sprint_p2_driver_id') ?? '').trim(),
      String(formData.get('sprint_p3_driver_id') ?? '').trim(),
        ].filter(Boolean)
      : [];
    if (!sprintRaceLocked && requestedSprintRacePicks.some((id) => !validDriverIds.has(id))) redirect(selfHref);

    const racePickSet = new Set([p1DriverId, p2DriverId, p3DriverId].filter(Boolean));
    const racePickCount = [p1DriverId, p2DriverId, p3DriverId].filter(Boolean).length;
    if (racePickSet.size !== racePickCount) redirect(selfHref);

    const sprintRacePickSet = new Set([sprintP1DriverId, sprintP2DriverId, sprintP3DriverId].filter(Boolean));
    const sprintRacePickCount = [sprintP1DriverId, sprintP2DriverId, sprintP3DriverId].filter(Boolean).length;
    if (sprintRacePickSet.size !== sprintRacePickCount) redirect(selfHref);

    const payload = {
      league_id: freshLeague.id,
      user_id: freshUser.id,
      season_year: seasonYear,
      round,
      pole_driver_id: poleDriverId,
      p1_driver_id: p1DriverId,
      p2_driver_id: p2DriverId,
      p3_driver_id: p3DriverId,
      sprint_pole_driver_id: sprintPoleDriverId,
      sprint_p1_driver_id: sprintP1DriverId,
      sprint_p2_driver_id: sprintP2DriverId,
      sprint_p3_driver_id: sprintP3DriverId,
      submitted_at: new Date().toISOString(),
    };

    db().prepare(
      `insert into race_predictions (
         league_id, user_id, season_year, round,
         pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id,
         sprint_pole_driver_id, sprint_p1_driver_id, sprint_p2_driver_id, sprint_p3_driver_id,
         submitted_at
       )
       values (
         @league_id, @user_id, @season_year, @round,
         @pole_driver_id, @p1_driver_id, @p2_driver_id, @p3_driver_id,
         @sprint_pole_driver_id, @sprint_p1_driver_id, @sprint_p2_driver_id, @sprint_p3_driver_id,
         @submitted_at
       )
       on conflict (league_id, user_id, season_year, round) do update set
         pole_driver_id=excluded.pole_driver_id,
         p1_driver_id=excluded.p1_driver_id,
         p2_driver_id=excluded.p2_driver_id,
         p3_driver_id=excluded.p3_driver_id,
         sprint_pole_driver_id=excluded.sprint_pole_driver_id,
         sprint_p1_driver_id=excluded.sprint_p1_driver_id,
         sprint_p2_driver_id=excluded.sprint_p2_driver_id,
         sprint_p3_driver_id=excluded.sprint_p3_driver_id,
         submitted_at=excluded.submitted_at`
    ).run(payload);

    redirect(selfHref);
  }

  return (
    <main className="app-bg">
      <LiveUpdates />
      <div className="shell max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-xs muted">Round {race.round}</div>
            <h1 className="text-5xl leading-none h-display">{race.name}</h1>
            <div className="mt-2 text-sm muted">
              Quali lock:{' '}
              <span className="mono">{qualiLockAt ? qualiLockAt.toLocaleString() : 'TBD'}</span> ({poleLocked ? 'locked' : 'open'})
              <span className="mono">{'  '}</span>
              {hasSprintWeekend ? (
                <>
                  Sprint quali lock:{' '}
                  <span className="mono">{sprintQualiLockAt ? sprintQualiLockAt.toLocaleString() : 'TBD'}</span> ({sprintPoleLocked ? 'locked' : 'open'})
                  <span className="mono">{'  '}</span>
                  Sprint race lock:{' '}
                  <span className="mono">{sprintRaceLockAt ? sprintRaceLockAt.toLocaleString() : 'TBD'}</span> ({sprintRaceLocked ? 'locked' : 'open'})
                  <span className="mono">{'  '}</span>
                </>
              ) : null}
              Race lock:{' '}
              <span className="mono">{raceLockAt ? raceLockAt.toLocaleString() : 'TBD'}</span> ({raceLocked ? 'locked' : 'open'})
            </div>
          </div>
          <Link className="btn" href={`/league/${league.code}/races`}>
            Back
          </Link>
        </div>

        <form action={save} className="mt-8 grid gap-3 card-solid p-5">
          <UniqueRaceSelects
            disabled={fullyLocked}
            disabledFields={{
              pole_driver_id: poleLocked,
              p1_driver_id: raceLocked,
              p2_driver_id: raceLocked,
              p3_driver_id: raceLocked,
              sprint_pole_driver_id: sprintPoleLocked,
              sprint_p1_driver_id: sprintRaceLocked,
              sprint_p2_driver_id: sprintRaceLocked,
              sprint_p3_driver_id: sprintRaceLocked,
            }}
            drivers={drivers ?? []}
            fields={[
              { name: 'pole_driver_id', label: 'Pole' },
              { name: 'p1_driver_id', label: 'P1' },
              { name: 'p2_driver_id', label: 'P2' },
              { name: 'p3_driver_id', label: 'P3' },
              ...(hasSprintWeekend
                ? [
                    { name: 'sprint_pole_driver_id', label: 'Sprint Pole' },
                    { name: 'sprint_p1_driver_id', label: 'Sprint P1' },
                    { name: 'sprint_p2_driver_id', label: 'Sprint P2' },
                    { name: 'sprint_p3_driver_id', label: 'Sprint P3' },
                  ]
                : []),
            ]}
            uniqueGroup={{
              pole_driver_id: 'quali',
              p1_driver_id: 'race',
              p2_driver_id: 'race',
              p3_driver_id: 'race',
              sprint_pole_driver_id: 'sprint_quali',
              sprint_p1_driver_id: 'sprint_race',
              sprint_p2_driver_id: 'sprint_race',
              sprint_p3_driver_id: 'sprint_race',
            }}
            initial={{
              pole_driver_id: pred?.pole_driver_id ?? '',
              p1_driver_id: pred?.p1_driver_id ?? '',
              p2_driver_id: pred?.p2_driver_id ?? '',
              p3_driver_id: pred?.p3_driver_id ?? '',
              sprint_pole_driver_id: pred?.sprint_pole_driver_id ?? '',
              sprint_p1_driver_id: pred?.sprint_p1_driver_id ?? '',
              sprint_p2_driver_id: pred?.sprint_p2_driver_id ?? '',
              sprint_p3_driver_id: pred?.sprint_p3_driver_id ?? '',
            }}
          />
        <button className={`btn ${fullyLocked ? '' : 'btn-primary'} disabled:opacity-50`} type="submit" disabled={fullyLocked}>
          {fullyLocked ? 'Locked' : 'Save picks'}
        </button>
      </form>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="card-solid p-5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="font-semibold">Certification</div>
              <div className="mono text-xs muted">{result ? 'CERTIFIED' : 'PENDING'}</div>
            </div>
            {result ? (
              <div className="mt-2 text-sm text-gray-700">
                Results fetched: {new Date(result.fetched_at).toLocaleString()}
                <div className="mt-2">
                  Pole: {result.pole_driver_id ?? '—'} | P1: {result.p1_driver_id ?? '—'} | P2: {result.p2_driver_id ?? '—'} | P3:{' '}
                  {result.p3_driver_id ?? '—'}
                </div>
                <div className="mt-2">
                  Sprint Pole: {result.sprint_pole_driver_id ?? '—'} | Sprint P1: {result.sprint_p1_driver_id ?? '—'} | Sprint P2:{' '}
                  {result.sprint_p2_driver_id ?? '—'} | Sprint P3: {result.sprint_p3_driver_id ?? '—'}
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm muted">
              No results yet. League owner can sync in{' '}
              {String(league.owner_id) === user.id ? (
                <Link className="underline underline-offset-4" href={`/league/${league.code}/admin`}>
                  admin
                </Link>
              ) : (
                <span className="mono">admin</span>
              )}
              .
              </div>
            )}
          </div>

        <div className="card-solid p-5">
          <div className="font-semibold">Your points</div>
          {scoring ? (
            <div className="mt-2 text-sm">
              <span className="mono">TOTAL {scoring.points}</span>
                <span className="muted">
                  {' '}
                  (pole {scoring.breakdown.pole}, p1 {scoring.breakdown.p1}, p2 {scoring.breakdown.p2}, p3 {scoring.breakdown.p3}, spole{' '}
                  {scoring.breakdown.sprintPole}, sp1 {scoring.breakdown.sprintP1}, sp2 {scoring.breakdown.sprintP2}, sp3 {scoring.breakdown.sprintP3})
                </span>
              </div>
          ) : (
            <div className="mt-2 text-sm muted">Pending results.</div>
          )}
        </div>
      </div>

      <div className="mt-6 card-solid p-5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="font-semibold">All predictions</div>
          <div className="mono text-xs muted">{canViewOthers ? 'VISIBLE' : 'LOCKED'}</div>
        </div>

        {!canViewOthers ? (
          <div className="mt-2 text-sm muted">Other picks become visible once predictions lock.</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ background: 'rgba(16, 19, 24, 0.03)' }} className="text-left">
                <tr>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Pole</th>
                  <th className="px-3 py-2">P1</th>
                  <th className="px-3 py-2">P2</th>
                  <th className="px-3 py-2">P3</th>
                  {hasSprintWeekend ? <th className="px-3 py-2">Sprint Pole</th> : null}
                  {hasSprintWeekend ? <th className="px-3 py-2">Sprint P1</th> : null}
                  {hasSprintWeekend ? <th className="px-3 py-2">Sprint P2</th> : null}
                  {hasSprintWeekend ? <th className="px-3 py-2">Sprint P3</th> : null}
                </tr>
              </thead>
              <tbody>
                {allPicks.map((r) => (
                  <tr key={r.user_id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-3 py-2 font-medium">{r.nickname}</td>
                    <td className="px-3 py-2">{r.pole_driver_id ? driverLabelById.get(String(r.pole_driver_id)) ?? r.pole_driver_id : '—'}</td>
                    <td className="px-3 py-2">{r.p1_driver_id ? driverLabelById.get(String(r.p1_driver_id)) ?? r.p1_driver_id : '—'}</td>
                    <td className="px-3 py-2">{r.p2_driver_id ? driverLabelById.get(String(r.p2_driver_id)) ?? r.p2_driver_id : '—'}</td>
                    <td className="px-3 py-2">{r.p3_driver_id ? driverLabelById.get(String(r.p3_driver_id)) ?? r.p3_driver_id : '—'}</td>
                    {hasSprintWeekend ? (
                      <td className="px-3 py-2">{r.sprint_pole_driver_id ? driverLabelById.get(String(r.sprint_pole_driver_id)) ?? r.sprint_pole_driver_id : '—'}</td>
                    ) : null}
                    {hasSprintWeekend ? (
                      <td className="px-3 py-2">{r.sprint_p1_driver_id ? driverLabelById.get(String(r.sprint_p1_driver_id)) ?? r.sprint_p1_driver_id : '—'}</td>
                    ) : null}
                    {hasSprintWeekend ? (
                      <td className="px-3 py-2">{r.sprint_p2_driver_id ? driverLabelById.get(String(r.sprint_p2_driver_id)) ?? r.sprint_p2_driver_id : '—'}</td>
                    ) : null}
                    {hasSprintWeekend ? (
                      <td className="px-3 py-2">{r.sprint_p3_driver_id ? driverLabelById.get(String(r.sprint_p3_driver_id)) ?? r.sprint_p3_driver_id : '—'}</td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
    </main>
  );
}
