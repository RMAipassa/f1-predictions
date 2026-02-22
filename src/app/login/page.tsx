import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, signIn } from '@/lib/auth';

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
    const res = await signIn(nickname, password);
    if (!res.ok) redirect(`/login?error=invalid&next=${encodeURIComponent(next)}`);
    redirect(next);
  }

  return (
    <main className="app-bg flex items-center justify-center p-6">
      <div className="w-full max-w-md card-solid p-6 wipe-in">
        <div className="flex items-baseline justify-between gap-4">
          <h1 className="text-3xl leading-none h-display">Track Day Picks</h1>
          <div className="mono text-xs muted">3210</div>
        </div>
        <p className="mt-2 text-sm muted">Sign in to join your league and lock your picks before lights out.</p>

        <form className="mt-6 grid gap-3" action={action}>
          <label className="block">
            <div className="text-sm font-semibold">Nickname</div>
            <input className="mt-1 w-full field" name="nickname" autoComplete="username" required />
          </label>
          <label className="block">
            <div className="text-sm font-semibold">Password</div>
            <input className="mt-1 w-full field" name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="w-full btn btn-primary" type="submit">
            Sign in
          </button>
        </form>

        <div className="mt-4 text-sm">
          <span className="muted">No account yet?</span>{' '}
          <Link className="underline underline-offset-4" href="/register">
            Register
          </Link>
        </div>

        {sp.error ? <p className="mt-4 text-sm text-red-700">Invalid login.</p> : null}
      </div>
    </main>
  );
}
