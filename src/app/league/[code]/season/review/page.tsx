import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getLeagueByCode } from '@/lib/league';
import { db } from '@/lib/db';

const WEIGHTS: Record<number, number> = { 1: 8, 2: 6, 3: 4, 4: 2, 5: 1 };

export default async function RandomReviewPage({ params }: { params: { code: string } }) {
  const { league, member, user } = await getLeagueByCode(params.code);
  if (!user) redirect(`/login?next=${encodeURIComponent(`/league/${params.code}/season/review`)}`);
  if (!league) return notFound();
  if (!member || member.role !== 'owner') return notFound();

  const seasonYear = new Date().getUTCFullYear();

  const preds = db()
    .prepare(
      `select sp.user_id, u.nickname, sp.random_json
       from season_predictions sp
       join users u on u.id = sp.user_id
       where sp.league_id = ? and sp.season_year = ?
       order by u.nickname asc`
    )
    .all(String(league.id), seasonYear) as any[];

  const reviews = db()
    .prepare('select user_id, idx, is_correct from random_prediction_reviews where league_id = ? and season_year = ?')
    .all(String(league.id), seasonYear) as any[];

  const reviewMap = new Map<string, boolean | null>();
  for (const r of reviews ?? []) {
    if (r.is_correct === null || typeof r.is_correct === 'undefined') {
      reviewMap.set(`${r.user_id}:${r.idx}`, null);
    } else {
      reviewMap.set(`${r.user_id}:${r.idx}`, Number(r.is_correct) === 1);
    }
  }

  async function save(formData: FormData) {
    'use server';

    const { league: freshLeague, member: freshMember, user: freshUser } = await getLeagueByCode(params.code);
    if (!freshLeague || !freshUser) return;
    if (!freshMember || freshMember.role !== 'owner') return;

    const rows: any[] = [];

    for (const [k, v] of formData.entries()) {
      if (!String(k).startsWith('r:')) continue;
      const [, userId, idxStr] = String(k).split(':');
      const idx = Number(idxStr);
      const val = String(v);
      const isCorrect = val === 'true' ? true : val === 'false' ? false : null;
      rows.push({
        league_id: String(freshLeague.id),
        user_id: userId,
        season_year: seasonYear,
        idx,
        is_correct: isCorrect === null ? null : isCorrect ? 1 : 0,
        reviewed_by: freshUser.id,
        reviewed_at: new Date().toISOString(),
      });
    }

    const stmt = db().prepare(
      `insert into random_prediction_reviews (league_id, user_id, season_year, idx, is_correct, reviewed_by, reviewed_at)
       values (@league_id, @user_id, @season_year, @idx, @is_correct, @reviewed_by, @reviewed_at)
       on conflict (league_id, user_id, season_year, idx) do update set
         is_correct=excluded.is_correct,
         reviewed_by=excluded.reviewed_by,
         reviewed_at=excluded.reviewed_at`
    );
    const tx = db().transaction(() => {
      for (const r of rows) stmt.run(r);
    });
    if (rows.length) tx();
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Random prediction review</h1>
          <div className="mt-1 text-sm text-gray-600">Season {seasonYear}</div>
        </div>
        <Link className="rounded-md border px-3 py-2 text-sm" href={`/league/${league.code}/season`}>
          Back
        </Link>
      </div>

      <form action={save} className="mt-6 grid gap-4">
        {preds.map((p: any) => (
          <div key={p.user_id} className="rounded-xl border bg-white p-4">
            <div className="text-sm font-medium">User: {p.nickname}</div>
            <div className="mt-3 grid gap-3">
              {([1, 2, 3, 4, 5] as const).map((idx) => {
                const random = JSON.parse(String(p.random_json || '{}')) as any;
                const text = random?.[`r${idx}`] ?? '';
                const current = reviewMap.get(`${p.user_id}:${idx}`);
                return (
                  <div key={idx} className="grid gap-1">
                    <div className="text-sm">{idx}. ({WEIGHTS[idx]}pt) {text || '—'}</div>
                    <select
                      className="w-full max-w-xs rounded-md border px-3 py-2 text-sm"
                      name={`r:${p.user_id}:${idx}`}
                      defaultValue={current === null || typeof current === 'undefined' ? '' : String(current)}
                    >
                      <option value="">Not decided</option>
                      <option value="true">Correct</option>
                      <option value="false">Incorrect</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        <button className="rounded-md bg-black px-3 py-2 text-white" type="submit">
          Save reviews
        </button>
      </form>
    </main>
  );
}
