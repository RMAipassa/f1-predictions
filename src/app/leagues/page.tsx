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
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-xs muted">Welcome, {user.nickname}</div>
            <h1 className="text-4xl leading-none h-display">Leagues</h1>
            <p className="mt-2 text-sm muted">All leagues on this host. Join by code or request access.</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link className="btn" href="/join">
              Join by code
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
          <div className="mono text-xs muted">YOUR LEAGUES</div>
          {yourLeagues.map((row: any) => (
            <div key={row.id} className="card-solid p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{row.name}</div>
                  <div className="mt-1 mono text-xs muted">Invite: {row.code}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Link className="btn" href={`/league/${row.code}`}>
                    Open
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
              <div className="mt-2 text-sm muted">Role: <span className="mono">{row.member_role}</span></div>
            </div>
          ))}

          {yourLeagues.length === 0 ? (
            <div className="card-solid p-5 text-sm">
              <div className="font-semibold">No leagues joined</div>
              <div className="mt-1 muted">Join by invite code, or request access from the list below.</div>
            </div>
          ) : null}

          <div className="mt-6 mono text-xs muted">ALL LEAGUES</div>
          {otherLeagues.map((row: any) => {
            const status = row.join_status as string | null;
            const disabled = status === 'pending' || status === 'approved';
            const label = status === 'pending' ? 'Requested' : status === 'approved' ? 'Approved' : 'Request to join';

            return (
              <div key={row.id} className="card-solid p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{row.name}</div>
                    <div className="mt-1 mono text-xs muted">Private league</div>
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
