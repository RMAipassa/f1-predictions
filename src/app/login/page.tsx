import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, signIn } from '@/lib/auth';

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string; error?: string };
}) {
  const user = await getCurrentUser();
  if (user) redirect('/leagues');

  const next = searchParams?.next ?? '/leagues';

  async function action(formData: FormData) {
    'use server';
    const nickname = String(formData.get('nickname') ?? '');
    const password = String(formData.get('password') ?? '');
    const res = await signIn(nickname, password);
    if (!res.ok) redirect(`/login?error=invalid&next=${encodeURIComponent(next)}`);
    redirect(next);
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-zinc-50">
      <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">F1 Predictions</h1>
        <p className="mt-1 text-sm text-gray-600">Sign in to your local league server.</p>

        <form className="mt-6 space-y-3" action={action}>
          <label className="block">
            <span className="text-sm font-medium">Nickname</span>
            <input className="mt-1 w-full rounded-md border px-3 py-2" name="nickname" required />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input className="mt-1 w-full rounded-md border px-3 py-2" name="password" type="password" required />
          </label>
          <button className="w-full rounded-md bg-black px-3 py-2 text-white" type="submit">
            Sign in
          </button>
        </form>

        <div className="mt-4 text-sm text-gray-700">
          No account yet?{' '}
          <Link className="underline" href="/register">
            Register
          </Link>
        </div>

        {searchParams?.error ? <p className="mt-4 text-sm text-red-700">Invalid login.</p> : null}
      </div>
    </main>
  );
}
