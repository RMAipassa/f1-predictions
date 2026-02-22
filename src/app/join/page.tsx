import { redirect } from 'next/navigation';
import Link from 'next/link';
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
    <main className="app-bg">
      <div className="shell max-w-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-xs muted">Invite</div>
            <h1 className="text-4xl leading-none h-display">Join A League</h1>
            <p className="mt-2 text-sm muted">Paste the code your friend sent you.</p>
          </div>
          <Link className="btn" href="/leagues">
            Back
          </Link>
        </div>

        <form action={join} className="mt-8 card-solid p-5 grid gap-3">
          <label className="block">
            <div className="text-sm font-semibold">Invite code</div>
            <input className="mt-1 w-full field mono" name="code" placeholder="8 characters" required />
          </label>
          <button className="btn btn-primary" type="submit">
            Join
          </button>
        </form>
      </div>
    </main>
  );
}
