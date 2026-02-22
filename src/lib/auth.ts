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

export function registerUser(nickname: string, password: string) {
  const nick = normalizeNick(nickname);
  if (!nick || nick.length < 2) return { ok: false as const, error: 'nickname_too_short' };
  if (password.length < 6) return { ok: false as const, error: 'password_too_short' };

  const id = randomId(16);
  const passwordHash = hashPassword(password);
  try {
    db().prepare('insert into users (id, nickname, password_hash, created_at) values (?,?,?,?)').run(id, nick, passwordHash, nowIso());
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
