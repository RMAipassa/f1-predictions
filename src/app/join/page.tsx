import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { joinLeague } from '@/lib/leagues';

export default function JoinPage() {
  async function join(formData: FormData) {
    'use server';
    const code = String(formData.get('code') ?? '').trim();
    if (!code) return;
    const user = await requireUser();
    const league = joinLeague(user.id, code);
    redirect(`/league/${league.code}`);
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-2xl font-semibold">Join a league</h1>
      <form action={join} className="mt-6 space-y-3">
        <label className="block">
          <span className="text-sm font-medium">Invite code</span>
          <input className="mt-1 w-full rounded-md border px-3 py-2" name="code" required />
        </label>
        <button className="rounded-md bg-black px-3 py-2 text-white" type="submit">
          Join
        </button>
      </form>
    </main>
  );
}
