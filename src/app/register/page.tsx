import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCurrentUser, registerUser, signIn } from '@/lib/auth';

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect('/leagues');

  async function action(formData: FormData) {
    'use server';
    const nickname = String(formData.get('nickname') ?? '');
    const password = String(formData.get('password') ?? '');

    const res = registerUser(nickname, password);
    if (!res.ok) {
      redirect(`/register?error=${encodeURIComponent(res.error)}`);
    }

    const sign = await signIn(nickname, password);
    if (!sign.ok) redirect('/login');
    redirect('/leagues');
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-zinc-50">
      <div className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="mt-1 text-sm text-gray-600">Nickname + password (local).</p>

        <form className="mt-6 space-y-3" action={action}>
          <label className="block">
            <span className="text-sm font-medium">Nickname</span>
            <input className="mt-1 w-full rounded-md border px-3 py-2" name="nickname" required />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input className="mt-1 w-full rounded-md border px-3 py-2" name="password" type="password" required />
            <div className="mt-1 text-xs text-gray-600">Min 6 characters.</div>
          </label>
          <button className="w-full rounded-md bg-black px-3 py-2 text-white" type="submit">
            Register
          </button>
        </form>

        <div className="mt-4 text-sm text-gray-700">
          Already have an account?{' '}
          <Link className="underline" href="/login">
            Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
