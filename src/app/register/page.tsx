import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, registerUser, signInWithOptions } from '@/lib/auth';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect('/leagues');

  const sp = await searchParams;

  async function action(formData: FormData) {
    'use server';
    const nickname = String(formData.get('nickname') ?? '');
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    const res = registerUser(nickname, password, email);
    if (!res.ok) {
      redirect(`/register?error=${encodeURIComponent(res.error)}`);
    }

    const sign = await signInWithOptions(nickname, password, { remember: true });
    if (!sign.ok) redirect('/login');
    redirect('/leagues');
  }

  return (
    <main className="app-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md card-solid p-6 wipe-in">
        <h1 className="text-3xl leading-none h-display">Create Driver ID</h1>
        <p className="mt-2 text-sm muted">Local nickname + password. Email is optional for recovery.</p>

        <form className="mt-6 grid gap-3" action={action}>
          <label className="block">
            <div className="text-sm font-semibold">Nickname</div>
            <input className="mt-1 w-full field" name="nickname" autoComplete="username" required />
          </label>
          <label className="block">
            <div className="text-sm font-semibold">Email (optional)</div>
            <input className="mt-1 w-full field" name="email" type="email" autoComplete="email" />
            <div className="mt-1 text-xs muted">Used for account recovery.</div>
          </label>
          <label className="block">
            <div className="text-sm font-semibold">Password</div>
            <input className="mt-1 w-full field" name="password" type="password" autoComplete="new-password" required />
            <div className="mt-1 text-xs muted">Min 6 characters.</div>
          </label>
          <button className="w-full btn btn-primary" type="submit">
            Register
          </button>
        </form>

        <div className="mt-4 text-sm">
          <span className="muted">Already have an account?</span>{' '}
          <Link className="underline underline-offset-4" href="/login">
            Sign in
          </Link>
        </div>

        {sp.error ? (
          <p className="mt-4 text-sm text-red-700">
            {sp.error === 'nickname_too_short'
              ? 'Nickname must be at least 2 characters.'
              : sp.error === 'password_too_short'
              ? 'Password must be at least 6 characters.'
              : sp.error === 'invalid_email'
              ? 'Email looks invalid.'
              : sp.error === 'email_taken'
              ? 'Email is already used by another account.'
              : 'Nickname is already taken.'}
          </p>
        ) : null}
      </div>
    </main>
  );
}
