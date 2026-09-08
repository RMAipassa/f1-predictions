import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { leaveLeague, requestToJoinLeague } from '@/lib/leagues';
import LiveUpdates from '@/components/LiveUpdates';

export default async function LeaguesPage() {
  let user;
  try {
    user = await requireUser();
  } catch {
    redirect('/login');
  }

  const rows = db()
    .prepare(
      `select
         l.id,
         l.code,
         l.name,
         l.owner_id,
         lm.role as member_role,
         ljr.status as join_status
       from leagues l
       left join league_members lm
         on lm.league_id = l.id and lm.user_id = ?
       left join league_join_requests ljr
         on ljr.league_id = l.id and ljr.user_id = ?
       order by l.created_at desc`
    )
    .all(user.id, user.id) as any[];

  const yourLeagues = rows.filter((r) => r.member_role);
  const otherLeagues = rows.filter((r) => !r.member_role);

  async function requestJoin(formData: FormData) {
    'use server';
    const u = await requireUser();
    const leagueId = String(formData.get('league_id') ?? '');
    if (!leagueId) return;
    requestToJoinLeague(u.id, leagueId);
    const { publishEvent } = await import('@/lib/events');
    publishEvent('join_requests_updated', { leagueId, at: new Date().toISOString() });
  }

  async function leave(formData: FormData) {
    'use server';
    const u = await requireUser();
    const leagueId = String(formData.get('league_id') ?? '');
    if (!leagueId) return;
    leaveLeague(u.id, leagueId);
    const { publishEvent } = await import('@/lib/events');
    publishEvent('leagues_updated', { leagueId, at: new Date().toISOString() });
  }

  return (
    <main className="app-bg">
      <LiveUpdates />
      <div className="shell">
        <div className="page-header">
          <div>
            <div className="eyebrow">Driver / {user.nickname}</div>
            <h1 className="mt-3 text-6xl leading-[0.88] h-display md:text-8xl">Your Paddock</h1>
            <p className="mt-4 max-w-xl text-sm muted">Enter a league, make the call, and see who read the weekend right.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <Link className="btn" href="/join">
              Join by code
            </Link>
            <Link className="btn btn-primary" href="/leagues/new">
              New league
            </Link>
            <Link className="btn" href="/account">
              Account
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

        <div className="mt-10 grid gap-3">
          <div className="eyebrow">Your Leagues</div>
          {yourLeagues.map((row: any) => (
            <div key={row.id} className="border-t border-[var(--border-strong)] bg-[var(--card-solid)] p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="h-display text-3xl leading-none">{row.name}</div>
                  <div className="mt-2 flex items-center gap-3 mono text-xs muted">
                    <span>{row.member_role}</span>
                    <span>/</span>
                    <span>Invite {row.code}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link className="btn btn-primary" href={`/league/${row.code}`}>
                    Enter league
                  </Link>
                  {row.member_role === 'member' ? (
                    <form action={leave}>
                      <input type="hidden" name="league_id" value={row.id} />
                      <button className="btn" type="submit">
                        Leave
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            </div>
          ))}

          {yourLeagues.length === 0 ? (
            <div className="card-solid p-5 text-sm">
              <div className="font-semibold">No leagues joined</div>
              <div className="mt-1 muted">Join by invite code, or request access from the list below.</div>
            </div>
          ) : null}

          <div className="eyebrow mt-8">Open Requests</div>
          {otherLeagues.map((row: any) => {
            const status = row.join_status as string | null;
            const disabled = status === 'pending' || status === 'approved';
            const label = status === 'pending' ? 'Requested' : status === 'approved' ? 'Approved' : 'Request to join';

            return (
              <div key={row.id} className="border-t border-[var(--border)] bg-[var(--card)] p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="h-display text-2xl leading-none">{row.name}</div>
                    <div className="mt-2 mono text-xs muted">Private league / approval required</div>
                  </div>
                  <form action={requestJoin}>
                    <input type="hidden" name="league_id" value={row.id} />
                    <button className={`btn ${disabled ? '' : 'btn-primary'} disabled:opacity-50`} type="submit" disabled={disabled}>
                      {label}
                    </button>
                  </form>
                </div>
                <div className="mt-2 text-sm muted">Not a member. Use invite code to join instantly, or request access.</div>
              </div>
            );
          })}

          {rows.length === 0 ? (
            <div className="card-solid p-5 text-sm">
              <div className="font-semibold">No leagues exist yet</div>
              <div className="mt-1 muted">Create the first league to get started.</div>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
