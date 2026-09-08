import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';

const SESSION_COOKIE = 'fp_session';

function nowIso() {
  return new Date().toISOString();
}

function randomId(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

function normalizeNick(nick: string) {
  return nick.trim().toLowerCase();
}

function isValidNickname(nick: string) {
  return Boolean(nick) && nick.length >= 2;
}

function normalizeEmail(emailRaw: string) {
  const v = String(emailRaw || '').trim().toLowerCase();
  return v || null;
}

function isValidEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email);
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const N = 16384;
  const r = 8;
  const p = 1;
  const derived = crypto.scryptSync(password, salt, 32, { N, r, p });
  return [
    'scrypt',
    String(N),
    String(r),
    String(p),
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

function verifyPassword(password: string, stored: string) {
  const [kind, nStr, rStr, pStr, saltB64, hashB64] = stored.split('$');
  if (kind !== 'scrypt') return false;
  const salt = Buffer.from(saltB64, 'base64');
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  const expected = Buffer.from(hashB64, 'base64');
  const derived = crypto.scryptSync(password, salt, expected.length, { N, r, p });
  return crypto.timingSafeEqual(expected, derived);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const row = db()
    .prepare(
      `select u.id, u.nickname
       from sessions s
       join users u on u.id = s.user_id
       where s.token = ? and s.expires_at > ?`
    )
    .get(token, nowIso()) as any;

  return row ? { id: row.id as string, nickname: row.nickname as string } : null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  return user;
}

export async function signOut() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    db().prepare('delete from sessions where token = ?').run(token);
  }
  cookieStore.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
}

export async function signIn(nickname: string, password: string) {
  return signInWithOptions(nickname, password, {});
}

export async function signInWithOptions(
  nickname: string,
  password: string,
  opts: { remember?: boolean } = {}
) {
  const nick = normalizeNick(nickname);
  const userRow = db().prepare('select id, password_hash from users where nickname = ?').get(nick) as any;
  if (!userRow) return { ok: false as const, error: 'invalid_login' };
  if (!verifyPassword(password, String(userRow.password_hash))) return { ok: false as const, error: 'invalid_login' };

  const remember = Boolean(opts.remember);
  const token = randomId(24);
  const ttlMs = remember ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60 * 24;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  db().prepare('insert into sessions (token, user_id, expires_at) values (?,?,?)').run(token, String(userRow.id), expiresAt);

  const cookieStore = await cookies();
  const cookie: Parameters<typeof cookieStore.set>[2] = {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
  if (remember) {
    cookie.maxAge = Math.floor(ttlMs / 1000);
  }
  cookieStore.set(SESSION_COOKIE, token, cookie);

  return { ok: true as const };
}

export function registerUser(nickname: string, password: string, emailRaw = '') {
  const nick = normalizeNick(nickname);
  if (!isValidNickname(nick)) return { ok: false as const, error: 'nickname_too_short' };
  if (password.length < 6) return { ok: false as const, error: 'password_too_short' };
  const email = normalizeEmail(emailRaw);
  if (email && !isValidEmail(email)) return { ok: false as const, error: 'invalid_email' };
  if (email) {
    const existing = db().prepare('select 1 from users where email = ?').get(email) as any;
    if (existing) return { ok: false as const, error: 'email_taken' };
  }

  const id = randomId(16);
  const passwordHash = hashPassword(password);
  try {
    db().prepare('insert into users (id, nickname, email, password_hash, created_at) values (?,?,?,?,?)').run(id, nick, email, passwordHash, nowIso());
  } catch {
    return { ok: false as const, error: 'nickname_taken' };
  }

  // First registered user becomes "host admin".
  const host = db().prepare('select v from kv where k = ?').get('host_user_id') as any;
  if (!host) {
    db().prepare('insert into kv (k, v) values (?, ?)').run('host_user_id', id);
    db().prepare('insert into kv (k, v) values (?, ?) on conflict (k) do nothing').run('public_hostname', 'f1.rubyruben.nl');
  }

  return { ok: true as const };
}

export async function requestPasswordReset(nickname: string) {
  const identifier = String(nickname || '').trim();
  const nick = normalizeNick(identifier);
  const email = normalizeEmail(identifier);
  if (!isValidNickname(nick) && !(email && isValidEmail(email))) return { ok: true as const };

  const userRow = db().prepare('select id, email from users where nickname = ? or email = ?').get(nick, email) as any;
  if (!userRow?.id) return { ok: true as const };

  db().prepare('delete from password_reset_tokens where user_id = ?').run(String(userRow.id));

  const token = randomId(24);
  const now = Date.now();
  const expiresAt = new Date(now + 1000 * 60 * 30).toISOString();
  db()
    .prepare('insert into password_reset_tokens (token, user_id, expires_at, created_at, used_at) values (?,?,?,?,null)')
    .run(token, String(userRow.id), expiresAt, nowIso());

  return { ok: true as const, token, email: userRow.email ? String(userRow.email) : null };
}

export async function updateRecoveryEmail(userId: string, currentPassword: string, emailRaw: string) {
  const uid = String(userId || '').trim();
  if (!uid) return { ok: false as const, error: 'invalid_user' };

  const userRow = db().prepare('select id, password_hash from users where id = ?').get(uid) as any;
  if (!userRow?.id) return { ok: false as const, error: 'invalid_user' };
  if (!verifyPassword(currentPassword, String(userRow.password_hash))) return { ok: false as const, error: 'invalid_login' };

  const email = normalizeEmail(emailRaw);
  if (email && !isValidEmail(email)) return { ok: false as const, error: 'invalid_email' };

  try {
    db().prepare('update users set email = ? where id = ?').run(email, uid);
  } catch {
    return { ok: false as const, error: 'email_taken' };
  }

  return { ok: true as const };
}

export async function createAdminPasswordResetToken(adminUserId: string, identifierRaw: string) {
  const hostRow = db().prepare('select v from kv where k = ?').get('host_user_id') as any;
  if (!hostRow?.v || String(hostRow.v) !== String(adminUserId)) return { ok: false as const, error: 'forbidden' };

  const identifier = String(identifierRaw || '').trim();
  const nick = normalizeNick(identifier);
  const email = normalizeEmail(identifier);
  if (!isValidNickname(nick) && !(email && isValidEmail(email))) return { ok: false as const, error: 'not_found' };

  const userRow = db().prepare('select id, nickname from users where nickname = ? or email = ?').get(nick, email) as any;
  if (!userRow?.id) return { ok: false as const, error: 'not_found' };

  db().prepare('delete from password_reset_tokens where user_id = ?').run(String(userRow.id));

  const token = randomId(24);
  const now = Date.now();
  const expiresAt = new Date(now + 1000 * 60 * 30).toISOString();
  db()
    .prepare('insert into password_reset_tokens (token, user_id, expires_at, created_at, used_at) values (?,?,?,?,null)')
    .run(token, String(userRow.id), expiresAt, nowIso());

  return { ok: true as const, token, nickname: String(userRow.nickname) };
}

export async function resetPasswordWithToken(tokenRaw: string, password: string) {
  const token = String(tokenRaw || '').trim();
  if (!token || token.length < 16) return { ok: false as const, error: 'invalid_token' };
  if (password.length < 6) return { ok: false as const, error: 'password_too_short' };

  const row = db()
    .prepare('select token, user_id, expires_at, used_at from password_reset_tokens where token = ?')
    .get(token) as any;
  if (!row) return { ok: false as const, error: 'invalid_token' };
  if (row.used_at) return { ok: false as const, error: 'invalid_token' };
  if (new Date(String(row.expires_at)).getTime() <= Date.now()) return { ok: false as const, error: 'expired_token' };

  const passwordHash = hashPassword(password);
  const tx = db().transaction(() => {
    db().prepare('update users set password_hash = ? where id = ?').run(passwordHash, String(row.user_id));
    db().prepare('update password_reset_tokens set used_at = ? where token = ?').run(nowIso(), token);
    db().prepare('delete from sessions where user_id = ?').run(String(row.user_id));
  });
  tx();

  return { ok: true as const };
}

export async function changeNickname(userId: string, currentPassword: string, newNickname: string) {
  const uid = String(userId || '').trim();
  const nextNick = normalizeNick(newNickname);
  if (!uid) return { ok: false as const, error: 'invalid_user' };
  if (!isValidNickname(nextNick)) return { ok: false as const, error: 'nickname_too_short' };

  const userRow = db().prepare('select id, nickname, password_hash from users where id = ?').get(uid) as any;
  if (!userRow?.id) return { ok: false as const, error: 'invalid_user' };
  if (!verifyPassword(currentPassword, String(userRow.password_hash))) return { ok: false as const, error: 'invalid_login' };
  if (String(userRow.nickname) === nextNick) return { ok: true as const };

  try {
    db().prepare('update users set nickname = ? where id = ?').run(nextNick, uid);
  } catch {
    return { ok: false as const, error: 'nickname_taken' };
  }

  return { ok: true as const };
}
