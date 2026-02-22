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
    <main className="app-bg">
      <div className="shell">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-xs muted">Welcome, {user.nickname}</div>
            <h1 className="text-4xl leading-none h-display">Your Leagues</h1>
            <p className="mt-2 text-sm muted">Create a league, hand out the invite code, and start picking.</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link className="btn" href="/join">
              Join
            </Link>
            <Link className="btn btn-primary" href="/leagues/new">
              New league
            </Link>
            <Link className="btn" href="/settings">
              Settings
            </Link>
            <form action="/logout" method="post">
              <button className="btn btn-dark" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>

        <div className="mt-8 grid gap-3">
        {leagues.map((row: any) => (
          <Link
            key={row.id}
            href={`/league/${row.code}`}
            className="card-solid p-4 transition-shadow hover:shadow-[0_18px_45px_rgba(16,19,24,0.12)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">{row.name}</div>
                <div className="mt-1 mono text-xs muted">Invite: {row.code}</div>
              </div>
              <div className="mono text-xs muted">{row.role}</div>
            </div>
          </Link>
        ))}

        {leagues.length === 0 ? (
          <div className="card-solid p-5 text-sm">
            <div className="font-semibold">No leagues yet</div>
            <div className="mt-1 muted">Create one, then share the invite code with your friends.</div>
          </div>
        ) : null}
        </div>
      </div>
    </main>
  );
}
