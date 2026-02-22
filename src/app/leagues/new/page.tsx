import { redirect } from 'next/navigation';
import Link from 'next/link';
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
    <main className="app-bg">
      <div className="shell max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-xs muted">Setup</div>
            <h1 className="text-4xl leading-none h-display">Create League</h1>
            <p className="mt-2 text-sm muted">You’ll get an invite code to share.</p>
          </div>
          <Link className="btn" href="/leagues">
            Back
          </Link>
        </div>

        <form action={createLeagueAction} className="mt-8 card-solid p-5 grid gap-3">
          <label className="block">
            <div className="text-sm font-semibold">League name</div>
            <input className="mt-1 w-full field" name="name" placeholder="e.g. Sunday Pit Crew" required />
          </label>
          <button className="btn btn-primary" type="submit">
            Create
          </button>
        </form>
      </div>
    </main>
  );
}
