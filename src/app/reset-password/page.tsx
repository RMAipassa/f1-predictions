import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, resetPasswordWithToken } from '@/lib/auth';

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string; ok?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect('/leagues');

  const sp = await searchParams;
  const token = String(sp.token ?? '').trim();

  async function action(formData: FormData) {
    'use server';

    const t = String(formData.get('token') ?? '').trim();
    const password = String(formData.get('password') ?? '');
    const confirm = String(formData.get('confirm') ?? '');
    if (!t) redirect('/reset-password?error=missing_token');
    if (password !== confirm) redirect(`/reset-password?token=${encodeURIComponent(t)}&error=mismatch`);

    const res = await resetPasswordWithToken(t, password);
    if (!res.ok) redirect(`/reset-password?token=${encodeURIComponent(t)}&error=${encodeURIComponent(res.error)}`);
    redirect('/reset-password?ok=1');
  }

  return (
    <main className="app-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md card-solid p-6 wipe-in">
        <h1 className="text-3xl leading-none h-display">Reset Password</h1>

        {sp.ok === '1' ? (
          <div className="mt-4 text-sm">
            <div className="font-semibold">Password updated.</div>
            <div className="mt-1 muted">You can now sign in with your new password.</div>
            <Link className="mt-3 inline-block underline underline-offset-4" href="/login">
              Go to sign in
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm muted">Use your reset token link and set a new password.</p>
            <form className="mt-6 grid gap-3" action={action}>
              <input type="hidden" name="token" value={token} />
              <label className="block">
                <div className="text-sm font-semibold">Token</div>
                <input className="mt-1 w-full field mono" value={token} readOnly />
              </label>
              <label className="block">
                <div className="text-sm font-semibold">New password</div>
                <input className="mt-1 w-full field" name="password" type="password" autoComplete="new-password" required />
              </label>
              <label className="block">
                <div className="text-sm font-semibold">Confirm password</div>
                <input className="mt-1 w-full field" name="confirm" type="password" autoComplete="new-password" required />
              </label>
              <button className="w-full btn btn-primary" type="submit">
                Reset password
              </button>
            </form>

            {sp.error ? (
              <div className="mt-4 text-sm text-red-700">
                {sp.error === 'mismatch'
                  ? 'Passwords do not match.'
                  : sp.error === 'password_too_short'
                  ? 'Password must be at least 6 characters.'
                  : sp.error === 'expired_token'
                  ? 'Reset token expired. Generate a new one.'
                  : sp.error === 'missing_token'
                  ? 'Missing reset token.'
                  : 'Invalid reset token.'}
              </div>
            ) : null}

            <div className="mt-4 text-sm">
              <Link className="underline underline-offset-4" href="/forgot-password">
                Generate new token
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
