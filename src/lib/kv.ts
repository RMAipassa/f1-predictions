import { db } from '@/lib/db';

export function getKv(key: string) {
  const row = db().prepare('select v from kv where k = ?').get(key) as any;
  return row ? String(row.v) : null;
}

export function setKv(key: string, value: string) {
  db().prepare('insert into kv (k, v) values (?, ?) on conflict (k) do update set v = excluded.v').run(key, value);
}
