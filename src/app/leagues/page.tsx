import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';

export default async function LeaguesPage() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect('/login');
  }

  const leagues = db()
    .prepare(
      `select lm.role, l.id, l.code, l.name
       from league_members lm
       join leagues l on l.id = lm.league_id
       where lm.user_id = ?
       order by lm.joined_at desc`
    )
    .all(user.id) as any[];

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Your leagues</h1>
        <div className="flex items-center gap-2">
          <Link className="rounded-md border px-3 py-2 text-sm" href="/leagues/new">
            New league
          </Link>
          <Link className="rounded-md border px-3 py-2 text-sm" href="/join">
            Join
          </Link>
          <Link className="rounded-md border px-3 py-2 text-sm" href="/settings">
            Settings
          </Link>
          <form action="/logout" method="post">
            <button className="rounded-md bg-black px-3 py-2 text-sm text-white" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </div>
      <div className="mt-6 grid gap-3">
        {leagues.map((row: any) => (
          <Link
            key={row.id}
            href={`/league/${row.code}`}
            className="rounded-lg border bg-white p-4 hover:bg-gray-50"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-medium">{row.name}</div>
                <div className="text-xs text-gray-600">Code: {row.code}</div>
              </div>
              <div className="text-xs text-gray-600">{row.role}</div>
            </div>
          </Link>
        ))}

        {leagues.length === 0 ? (
          <div className="rounded-lg border bg-white p-4 text-sm text-gray-700">
            No leagues yet. Create one or join with an invite code.
          </div>
        ) : null}
      </div>
    </main>
  );
}
