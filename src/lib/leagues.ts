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
