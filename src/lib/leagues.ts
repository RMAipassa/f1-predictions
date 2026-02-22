import crypto from 'node:crypto';
import { db } from '@/lib/db';

function nowIso() {
  return new Date().toISOString();
}

function randomId(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  const bytes = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

export function createLeague(ownerUserId: string, name: string) {
  const leagueId = randomId(16);
  let code = generateCode();

  const insertLeague = db().prepare('insert into leagues (id, code, name, owner_id, created_at) values (?,?,?,?,?)');
  const insertMember = db().prepare('insert into league_members (league_id, user_id, role, joined_at) values (?,?,?,?)');

  const tx = db().transaction(() => {
    while (true) {
      try {
        insertLeague.run(leagueId, code, name, ownerUserId, nowIso());
        break;
      } catch {
        code = generateCode();
      }
    }
    insertMember.run(leagueId, ownerUserId, 'owner', nowIso());
  });

  tx();
  return { id: leagueId, code, name };
}

export function joinLeague(userId: string, codeRaw: string) {
  const code = codeRaw.trim().toUpperCase();
  const league = db().prepare('select id, code, name from leagues where code = ?').get(code) as any;
  if (!league) throw new Error('league_not_found');

  db().prepare(
    'insert or ignore into league_members (league_id, user_id, role, joined_at) values (?,?,?,?)'
  ).run(String(league.id), userId, 'member', nowIso());

  return { id: String(league.id), code: String(league.code), name: String(league.name) };
}

export function requestToJoinLeague(userId: string, leagueId: string) {
  const league = db().prepare('select id from leagues where id = ?').get(leagueId) as any;
  if (!league) throw new Error('league_not_found');

  const member = db()
    .prepare('select 1 from league_members where league_id = ? and user_id = ?')
    .get(leagueId, userId);
  if (member) return { ok: true as const, status: 'already_member' as const };

  db().prepare(
    `insert into league_join_requests (league_id, user_id, status, created_at)
     values (?,?, 'pending', ?)
     on conflict (league_id, user_id) do update set
       status=case when league_join_requests.status = 'rejected' then 'pending' else league_join_requests.status end,
       created_at=excluded.created_at`
  ).run(leagueId, userId, nowIso());

  return { ok: true as const, status: 'pending' as const };
}

export function decideJoinRequest(ownerUserId: string, leagueId: string, userId: string, decision: 'approve' | 'reject') {
  const league = db().prepare('select owner_id from leagues where id = ?').get(leagueId) as any;
  if (!league) throw new Error('league_not_found');
  if (String(league.owner_id) !== ownerUserId) throw new Error('not_owner');

  const now = nowIso();
  const tx = db().transaction(() => {
    if (decision === 'approve') {
      db().prepare('insert or ignore into league_members (league_id, user_id, role, joined_at) values (?,?,?,?)').run(
        leagueId,
        userId,
        'member',
        now
      );
      db().prepare(
        `insert into league_join_requests (league_id, user_id, status, created_at, decided_by, decided_at)
         values (?,?, 'approved', ?, ?, ?)
         on conflict (league_id, user_id) do update set
           status='approved',
           decided_by=excluded.decided_by,
           decided_at=excluded.decided_at`
      ).run(leagueId, userId, now, ownerUserId, now);
    } else {
      db().prepare(
        `insert into league_join_requests (league_id, user_id, status, created_at, decided_by, decided_at)
         values (?,?, 'rejected', ?, ?, ?)
         on conflict (league_id, user_id) do update set
           status='rejected',
           decided_by=excluded.decided_by,
           decided_at=excluded.decided_at`
      ).run(leagueId, userId, now, ownerUserId, now);
    }
  });
  tx();
}

export function leaveLeague(userId: string, leagueId: string) {
  const league = db().prepare('select owner_id from leagues where id = ?').get(leagueId) as any;
  if (!league) throw new Error('league_not_found');
  if (String(league.owner_id) === userId) throw new Error('owner_cannot_leave');

  db().prepare('delete from league_members where league_id = ? and user_id = ?').run(leagueId, userId);
}

export function deleteLeague(ownerUserId: string, leagueId: string) {
  const league = db().prepare('select owner_id from leagues where id = ?').get(leagueId) as any;
  if (!league) throw new Error('league_not_found');
  if (String(league.owner_id) !== ownerUserId) throw new Error('not_owner');

  db().prepare('delete from leagues where id = ?').run(leagueId);
}
