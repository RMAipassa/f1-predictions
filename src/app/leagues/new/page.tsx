import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';
import { createLeague } from '@/lib/leagues';

export default function NewLeaguePage() {
  async function createLeagueAction(formData: FormData) {
    'use server';

    const name = String(formData.get('name') ?? '').trim();
    if (!name) return;

    const user = await requireUser();
    const league = createLeague(user.id, name);
    redirect(`/league/${league.code}`);
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-2xl font-semibold">Create league</h1>
      <form action={createLeagueAction} className="mt-6 space-y-3">
        <label className="block">
          <span className="text-sm font-medium">League name</span>
          <input className="mt-1 w-full rounded-md border px-3 py-2" name="name" required />
        </label>
        <button className="rounded-md bg-black px-3 py-2 text-white" type="submit">
          Create
        </button>
      </form>
    </main>
  );
}
