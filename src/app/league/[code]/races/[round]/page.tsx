import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
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

export default async function RaceRoundPage({ params }: { params: Promise<{ code: string; round: string }> }) {
  const p = await params;
  const round = Number(p.round);
  if (!Number.isFinite(round)) return notFound();

  const { league, user } = await getLeagueByCode(p.code);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/league/${p.code}/races/${p.round}`)}`);
  if (!league) return notFound();

  const seasonYear = new Date().getUTCFullYear();

  const race = db()
    .prepare('select season_year, round, name, race_start from races where season_year = ? and round = ?')
    .get(seasonYear, round) as any;
  const drivers = db()
    .prepare('select driver_id, given_name, family_name, code from drivers order by family_name asc')
    .all() as any[];
  const pred = db()
    .prepare(
      'select pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id, submitted_at from race_predictions where league_id = ? and user_id = ? and season_year = ? and round = ?'
    )
    .get(String(league.id), user.id, seasonYear, round) as any;
  const result = db()
    .prepare(
      'select pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id, fetched_at from race_results where season_year = ? and round = ?'
    )
    .get(seasonYear, round) as any;

  if (!race) return notFound();

  const lockAt = race.race_start ? new Date(race.race_start) : null;
  const locked = lockAt ? lockAt.getTime() <= Date.now() : false;
  const scoring = result ? scoreRacePick(pred, result) : null;

  async function save(formData: FormData) {
    'use server';

    const { league: freshLeague, user: freshUser } = await getLeagueByCode(p.code);
    if (!freshLeague || !freshUser) return;

    const freshRace = db().prepare('select race_start from races where season_year = ? and round = ?').get(seasonYear, round) as any;
    const freshLockAt = freshRace?.race_start ? new Date(String(freshRace.race_start)) : null;
    if (freshLockAt && freshLockAt.getTime() <= Date.now()) {
      return;
    }

    const payload = {
      league_id: freshLeague.id,
      user_id: freshUser.id,
      season_year: seasonYear,
      round,
      pole_driver_id: String(formData.get('pole_driver_id') ?? '') || null,
      p1_driver_id: String(formData.get('p1_driver_id') ?? '') || null,
      p2_driver_id: String(formData.get('p2_driver_id') ?? '') || null,
      p3_driver_id: String(formData.get('p3_driver_id') ?? '') || null,
      submitted_at: new Date().toISOString(),
    };

    db().prepare(
      `insert into race_predictions (league_id, user_id, season_year, round, pole_driver_id, p1_driver_id, p2_driver_id, p3_driver_id, submitted_at)
       values (@league_id, @user_id, @season_year, @round, @pole_driver_id, @p1_driver_id, @p2_driver_id, @p3_driver_id, @submitted_at)
       on conflict (league_id, user_id, season_year, round) do update set
         pole_driver_id=excluded.pole_driver_id,
         p1_driver_id=excluded.p1_driver_id,
         p2_driver_id=excluded.p2_driver_id,
         p3_driver_id=excluded.p3_driver_id,
         submitted_at=excluded.submitted_at`
    ).run(payload);
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
              Lock: <span className="mono">{lockAt ? lockAt.toLocaleString() : 'TBD'}</span> ({locked ? 'locked' : 'open'})
            </div>
          </div>
          <Link className="btn" href={`/league/${league.code}/races`}>
            Back
          </Link>
        </div>

        <form action={save} className="mt-8 grid gap-3 card-solid p-5">
        <Select
          name="pole_driver_id"
          label="Pole"
          disabled={locked}
          drivers={drivers ?? []}
          defaultValue={pred?.pole_driver_id ?? ''}
        />
        <Select
          name="p1_driver_id"
          label="P1"
          disabled={locked}
          drivers={drivers ?? []}
          defaultValue={pred?.p1_driver_id ?? ''}
        />
        <Select
          name="p2_driver_id"
          label="P2"
          disabled={locked}
          drivers={drivers ?? []}
          defaultValue={pred?.p2_driver_id ?? ''}
        />
        <Select
          name="p3_driver_id"
          label="P3"
          disabled={locked}
          drivers={drivers ?? []}
          defaultValue={pred?.p3_driver_id ?? ''}
        />
        <button className={`btn ${locked ? '' : 'btn-primary'} disabled:opacity-50`} type="submit" disabled={locked}>
          {locked ? 'Locked' : 'Save picks'}
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
            </div>
          ) : (
            <div className="mt-2 text-sm muted">
              No results yet. League owner can sync in{' '}
              <Link className="underline underline-offset-4" href={`/league/${league.code}/admin`}>
                admin
              </Link>
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
                (pole {scoring.breakdown.pole}, p1 {scoring.breakdown.p1}, p2 {scoring.breakdown.p2}, p3 {scoring.breakdown.p3})
              </span>
            </div>
          ) : (
            <div className="mt-2 text-sm muted">Pending results.</div>
          )}
        </div>
      </div>
      </div>
    </main>
  );
}

function Select({
  name,
  label,
  drivers,
  defaultValue,
  disabled,
}: {
  name: string;
  label: string;
  drivers: any[];
  defaultValue: string;
  disabled: boolean;
}) {
  return (
    <label className="block">
      <div className="text-sm font-semibold">{label}</div>
      <select
        className="mt-1 w-full field"
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
      >
        <option value="">—</option>
        {drivers.map((d) => (
          <option key={d.driver_id} value={d.driver_id}>
            {d.family_name}, {d.given_name} {d.code ? `(${d.code})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
