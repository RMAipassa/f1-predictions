import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, signInWithOptions } from '@/lib/auth';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect('/leagues');

  const sp = await searchParams;
  const next = sp.next ?? '/leagues';

  async function action(formData: FormData) {
    'use server';
    const nickname = String(formData.get('nickname') ?? '');
    const password = String(formData.get('password') ?? '');
    const remember = String(formData.get('remember') ?? '') === 'on';
    const res = await signInWithOptions(nickname, password, { remember });
    if (!res.ok) redirect(`/login?error=invalid&next=${encodeURIComponent(next)}`);
    redirect(next);
  }

  return (
    <main className="app-bg">
      <div className="shell">
        <div className="auth-layout wipe-in">
          <section className="auth-brand">
            <div className="eyebrow text-white/60">F1 Predictions</div>
            <div className="relative z-10">
              <div className="h-display text-7xl leading-[0.78] sm:text-8xl">Call it<br />before<br />lights out.</div>
              <div className="mt-5 max-w-sm text-sm text-white/55">Private championships, race-weekend picks and real-world karting pace in one paddock.</div>
            </div>
          </section>

          <section className="auth-panel">
            <div className="eyebrow">Driver Login</div>
            <h1 className="mt-3 text-5xl leading-none h-display">Enter the paddock</h1>
            <p className="mt-3 text-sm muted">Sign in to lock your picks before the session starts.</p>

            <form className="mt-8 grid gap-4" action={action}>
              <label className="block">
                <div className="mono text-xs font-semibold uppercase tracking-wider">Nickname</div>
                <input className="mt-2 w-full field" name="nickname" autoComplete="username" required />
              </label>
              <label className="block">
                <div className="mono text-xs font-semibold uppercase tracking-wider">Password</div>
                <input className="mt-2 w-full field" name="password" type="password" autoComplete="current-password" required />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="remember" defaultChecked />
                <span className="muted">Remember this device</span>
              </label>
              <button className="w-full btn btn-primary" type="submit">Sign in</button>
            </form>

            <div className="mt-6 border-t border-[var(--border)] pt-4 text-sm">
              <span className="muted">New driver?</span>{' '}
              <Link className="underline underline-offset-4" href="/register">Create account</Link>
              <span className="mx-2 muted">/</span>
              <Link className="underline underline-offset-4" href="/forgot-password">Reset password</Link>
            </div>

            {sp.error ? <p className="mt-4 text-sm text-red-700">Nickname or password is incorrect.</p> : null}
          </section>
        </div>
      </div>
    </main>
  );
}
