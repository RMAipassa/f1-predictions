import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export async function getLeagueByCode(codeRaw: string) {
  const code = codeRaw.toUpperCase();
  const user = await getCurrentUser();
  if (!user) return { league: null as any, member: null as any, user: null as any };

  const league = db().prepare('select id, code, name, owner_id from leagues where code = ?').get(code) as any;
  if (!league) return { league: null as any, member: null as any, user: null as any };

  const member = db()
    .prepare('select role from league_members where league_id = ? and user_id = ?')
    .get(String(league.id), user.id) as any;

  if (!member) return { league: null as any, member: null as any, user: null as any };
  return { league, member, user };
}
