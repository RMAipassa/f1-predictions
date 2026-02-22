import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { getKv, setKv } from '@/lib/kv';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const hostUserId = getKv('host_user_id');
  if (!hostUserId || hostUserId !== user.id) return notFound();

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
    <main className="mx-auto max-w-2xl p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Host settings</h1>
          <div className="mt-1 text-sm text-gray-600">Public URL: https://{hostname}</div>
        </div>
        <Link className="rounded-md border px-3 py-2 text-sm" href="/leagues">
          Back
        </Link>
      </div>

      <div className="mt-6 rounded-xl border bg-white p-4 text-sm text-gray-700">
        Cloudflare Tunnel token: {tokenSet ? 'set' : 'not set'}
      </div>

      <form action={save} className="mt-4 grid gap-3 rounded-xl border bg-white p-4">
        <label className="block">
          <div className="text-sm font-medium">cloudflared token</div>
          <textarea className="mt-1 w-full rounded-md border px-3 py-2" name="token" rows={4} placeholder="Paste the tunnel token here" />
          <div className="mt-1 text-xs text-gray-600">App will start the tunnel on next launch.</div>
        </label>
        <button className="rounded-md bg-black px-3 py-2 text-white" type="submit">
          Save
        </button>
      </form>
    </main>
  );
}
