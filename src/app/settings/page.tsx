import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getKv, setKv } from '@/lib/kv';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const hostUserId = getKv('host_user_id');
  const isHost = Boolean(hostUserId && hostUserId === user.id);

  const hostname = getKv('public_hostname') ?? 'f1.rubyruben.nl';
  const tokenSet = Boolean(getKv('cloudflared_token'));

  async function save(formData: FormData) {
    'use server';
    const me = await getCurrentUser();
    if (!me) redirect('/login');
    const host = getKv('host_user_id');
    if (!host || host !== me.id) return;

    const token = String(formData.get('token') ?? '').trim();
    if (token) setKv('cloudflared_token', token);
    setKv('public_hostname', hostname);
  }

  return (
    <main className="app-bg">
      <div className="shell max-w-3xl">
        <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mono text-xs muted">Host</div>
          <h1 className="text-5xl leading-none h-display">Settings</h1>
          <div className="mt-2 text-sm muted">
            Public URL: <span className="mono">https://{hostname}</span>
          </div>
        </div>
        <Link className="btn" href="/leagues">
          Back
        </Link>
      </div>

        <div className="mt-8 card-solid p-5 text-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold">Cloudflare Tunnel</div>
            <div className={`mono text-xs ${tokenSet ? '' : 'muted'}`}>{tokenSet ? 'TOKEN SET' : 'TOKEN MISSING'}</div>
          </div>
          <div className="mt-1 muted">
            If you run the tunnel yourself, you can ignore this. {isHost ? 'Host can store the token here.' : 'Host-only: token storage.'}
          </div>
        </div>

        {isHost ? (
          <form action={save} className="mt-4 grid gap-3 card-solid p-5">
            <label className="block">
              <div className="text-sm font-semibold">cloudflared token</div>
              <textarea className="mt-1 w-full field mono" name="token" rows={4} placeholder="Paste the tunnel token here" />
              <div className="mt-1 text-xs muted">App will start the tunnel on next launch (if you want it to).</div>
            </label>
            <button className="btn btn-primary" type="submit">
              Save
            </button>
          </form>
        ) : (
          <div className="mt-4 card-solid p-5 text-sm">
            <div className="font-semibold">Host-only settings</div>
            <div className="mt-1 muted">You can use the app normally; only the first registered user can edit tunnel settings.</div>
          </div>
        )}
      </div>
    </main>
  );
}
