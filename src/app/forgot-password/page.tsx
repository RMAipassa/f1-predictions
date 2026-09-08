import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, requestPasswordReset } from '@/lib/auth';
import { isSmtpConfigured, passwordResetUrl, sendPasswordResetEmail } from '@/lib/mail';

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; token?: string; emailed?: string; emailError?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect('/leagues');

  const sp = await searchParams;
  const done = sp.ok === '1';
  const token = String(sp.token ?? '');
  const emailed = sp.emailed === '1';
  const emailError = sp.emailError === '1';
  const resetLink = token ? passwordResetUrl(token) : '';

  async function action(formData: FormData) {
    'use server';
    const nickname = String(formData.get('nickname') ?? '');
    const res = await requestPasswordReset(nickname);
    if (res.token && res.email) {
      let sent = false;
      if (isSmtpConfigured()) {
        try {
          const mail = await sendPasswordResetEmail(res.email, res.token);
          sent = mail.ok;
        } catch {
          // Show a delivery error without exposing the reset token.
        }
      }
      if (sent) redirect('/forgot-password?ok=1&emailed=1');
      redirect('/forgot-password?ok=1&emailError=1');
    }

    const tokenParam = res.token ? `&token=${encodeURIComponent(res.token)}` : '';
    redirect(`/forgot-password?ok=1${tokenParam}`);
  }

  return (
    <main className="app-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md card-solid p-6 wipe-in">
        <h1 className="text-3xl leading-none h-display">Forgot Password</h1>
        <p className="mt-2 text-sm muted">Enter your nickname or recovery email to generate a reset link.</p>

        <form className="mt-6 grid gap-3" action={action}>
          <label className="block">
            <div className="text-sm font-semibold">Nickname or email</div>
            <input className="mt-1 w-full field" name="nickname" autoComplete="username" required />
          </label>
          <button className="w-full btn btn-primary" type="submit">
            Generate reset link
          </button>
        </form>

        {done ? (
          <div className="mt-4 card p-4 text-sm">
            <div className="font-semibold">Reset request processed</div>
            <div className="mt-1 muted">If the account exists, recovery instructions are ready.</div>
            {emailed ? (
              <div className="mt-2">Reset link sent by email.</div>
            ) : emailError ? (
              <div className="mt-2 text-red-700">The reset email could not be sent. Contact the app administrator.</div>
            ) : token ? (
              <div className="mt-2">
                Use this one-time link:
                <a className="mt-1 block break-all mono underline underline-offset-4" href={resetLink}>
                  {resetLink}
                </a>
              </div>
            ) : (
              <div className="mt-2 muted">No on-screen token available.</div>
            )}
          </div>
        ) : null}

        <div className="mt-4 text-sm">
          <Link className="underline underline-offset-4" href="/login">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
