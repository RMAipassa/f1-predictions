import Link from 'next/link';
import { redirect } from 'next/navigation';
import { changeNickname, getCurrentUser, updateRecoveryEmail } from '@/lib/auth';
import { db } from '@/lib/db';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ nick?: string; mail?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const userRow = db().prepare('select email from users where id = ?').get(user.id) as any;
  const email = userRow?.email ? String(userRow.email) : '';

  async function saveNickname(formData: FormData) {
    'use server';
    const me = await getCurrentUser();
    if (!me) redirect('/login');

    const nickname = String(formData.get('nickname') ?? '');
    const password = String(formData.get('password') ?? '');
    const res = await changeNickname(me.id, password, nickname);
    if (!res.ok) redirect(`/account?nick=${encodeURIComponent(res.error)}`);
    redirect('/account?nick=ok');
  }

  async function saveEmail(formData: FormData) {
    'use server';
    const me = await getCurrentUser();
    if (!me) redirect('/login');

    const nextEmail = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');
    const res = await updateRecoveryEmail(me.id, password, nextEmail);
    if (!res.ok) redirect(`/account?mail=${encodeURIComponent(res.error)}`);
    redirect('/account?mail=ok');
  }

  return (
    <main className="app-bg">
      <div className="shell max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-xs muted">Profile</div>
            <h1 className="text-5xl leading-none h-display">Account</h1>
            <div className="mt-2 text-sm muted">Manage your nickname.</div>
          </div>
          <Link className="btn" href="/leagues">
            Back
          </Link>
        </div>

        <div className="mt-8 card-solid p-5">
          <div className="text-lg font-semibold">Recovery email</div>
          <div className="mt-1 text-sm muted">Used for password recovery identity. Leave empty to remove email.</div>

          <form action={saveEmail} className="mt-4 grid gap-3">
            <label className="block">
              <div className="text-sm font-semibold">Email</div>
              <input className="mt-1 w-full field" name="email" type="email" autoComplete="email" defaultValue={email} />
            </label>
            <label className="block">
              <div className="text-sm font-semibold">Current password</div>
              <input className="mt-1 w-full field" name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="btn" type="submit">
              Save email
            </button>
          </form>

          {sp.mail ? (
            <div className={`mt-3 text-sm ${sp.mail === 'ok' ? '' : 'text-red-700'}`}>
              {sp.mail === 'ok'
                ? 'Recovery email updated.'
                : sp.mail === 'email_taken'
                ? 'That email is already used by another account.'
                : sp.mail === 'invalid_email'
                ? 'Email looks invalid.'
                : sp.mail === 'invalid_login'
                ? 'Current password is incorrect.'
                : 'Could not update recovery email.'}
            </div>
          ) : null}
        </div>

        <div className="mt-4 card-solid p-5">
          <div className="text-lg font-semibold">Change nickname</div>
          <div className="mt-1 text-sm muted">
            Current nickname: <span className="mono">{user.nickname}</span>
          </div>

          <form action={saveNickname} className="mt-4 grid gap-3">
            <label className="block">
              <div className="text-sm font-semibold">New nickname</div>
              <input className="mt-1 w-full field" name="nickname" defaultValue={user.nickname} required maxLength={40} />
            </label>
            <label className="block">
              <div className="text-sm font-semibold">Current password</div>
              <input className="mt-1 w-full field" name="password" type="password" autoComplete="current-password" required />
            </label>
            <button className="btn btn-primary" type="submit">
              Save nickname
            </button>
          </form>

          {sp.nick ? (
            <div className={`mt-3 text-sm ${sp.nick === 'ok' ? '' : 'text-red-700'}`}>
              {sp.nick === 'ok'
                ? 'Nickname updated.'
                : sp.nick === 'nickname_taken'
                ? 'That nickname is already taken.'
                : sp.nick === 'nickname_too_short'
                ? 'Nickname must be at least 2 characters.'
                : sp.nick === 'invalid_login'
                ? 'Current password is incorrect.'
                : 'Could not update nickname.'}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
