import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createAdminPasswordResetToken, getCurrentUser } from '@/lib/auth';
import { getKv, setKv } from '@/lib/kv';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const hostUserId = getKv('host_user_id');
  const isHost = Boolean(hostUserId && hostUserId === user.id);

  const hostname = getKv('public_hostname') ?? 'f1.rubyruben.nl';
  const tokenSet = Boolean(getKv('cloudflared_token'));
  const smtpHost = getKv('smtp_host') ?? '';
  const smtpPort = getKv('smtp_port') ?? '587';
  const smtpSecure = getKv('smtp_secure') ?? '0';
  const smtpUser = getKv('smtp_user') ?? '';
  const smtpFrom = getKv('smtp_from') ?? '';
  const smtpPassSet = Boolean(getKv('smtp_pass'));

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

  async function createRecovery(formData: FormData) {
    'use server';
    const me = await getCurrentUser();
    if (!me) redirect('/login');

    const identifier = String(formData.get('identifier') ?? '');
    const res = await createAdminPasswordResetToken(me.id, identifier);
    if (!res.ok) redirect(`/settings?recovery=${encodeURIComponent(res.error)}`);

    redirect(
      `/settings?recovery=ok&target=${encodeURIComponent(res.nickname)}&token=${encodeURIComponent(res.token)}`
    );
  }

  async function saveSmtp(formData: FormData) {
    'use server';
    const me = await getCurrentUser();
    if (!me) redirect('/login');
    const host = getKv('host_user_id');
    if (!host || host !== me.id) return;

    const hostVal = String(formData.get('smtp_host') ?? '').trim();
    const portVal = String(formData.get('smtp_port') ?? '').trim() || '587';
    const secureVal = String(formData.get('smtp_secure') ?? '0') === '1' ? '1' : '0';
    const userVal = String(formData.get('smtp_user') ?? '').trim();
    const fromVal = String(formData.get('smtp_from') ?? '').trim();
    const passVal = String(formData.get('smtp_pass') ?? '');

    setKv('smtp_host', hostVal);
    setKv('smtp_port', portVal);
    setKv('smtp_secure', secureVal);
    setKv('smtp_user', userVal);
    setKv('smtp_from', fromVal);
    if (passVal) setKv('smtp_pass', passVal);

    redirect('/settings?smtp=ok');
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
          <>
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

            <div className="mt-4 card-solid p-5 text-sm">
              <div className="font-semibold">SMTP mail delivery</div>
              <div className="mt-1 muted">Configure email sending for password reset links.</div>

              <form action={saveSmtp} className="mt-3 grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className="field" name="smtp_host" defaultValue={smtpHost} placeholder="SMTP host" />
                  <input className="field" name="smtp_port" defaultValue={smtpPort} placeholder="Port (e.g. 587)" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className="field" name="smtp_user" defaultValue={smtpUser} placeholder="SMTP user" />
                  <input className="field" name="smtp_from" defaultValue={smtpFrom} placeholder="From email" />
                </div>
                <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="smtp_secure" value="1" defaultChecked={smtpSecure === '1'} />
                    <span className="muted">Use TLS/SSL</span>
                  </label>
                  <input className="field" type="password" name="smtp_pass" placeholder={smtpPassSet ? 'SMTP app password (leave empty to keep)' : 'SMTP app password'} />
                </div>
                <button className="btn" type="submit">
                  Save SMTP
                </button>
              </form>

              {sp.smtp === 'ok' ? <div className="mt-2 text-sm">SMTP settings saved.</div> : null}
            </div>

            <div className="mt-4 card-solid p-5 text-sm">
              <div className="font-semibold">Admin account recovery</div>
              <div className="mt-1 muted">Generate a one-time reset token for any user by nickname or email.</div>

              <form action={createRecovery} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
                <input className="field" name="identifier" placeholder="Nickname or email" required />
                <button className="btn" type="submit">
                  Create token
                </button>
              </form>

              {sp.recovery ? (
                <div className={`mt-3 ${sp.recovery === 'ok' ? '' : 'text-red-700'}`}>
                  {sp.recovery === 'ok' ? (
                    <>
                      <div className="font-semibold">Recovery token for {sp.target}</div>
                      <div className="mt-1 mono break-all">/reset-password?token={sp.token}</div>
                    </>
                  ) : sp.recovery === 'not_found' ? (
                    'No matching user found.'
                  ) : (
                    'Could not create recovery token.'
                  )}
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="mt-4 card-solid p-5 text-sm">
            <div className="font-semibold">Host-only settings</div>
            <div className="mt-1 muted">You can use the app normally; only the first registered user can edit tunnel settings.</div>
          </div>
        )}

        <div className="mt-4 card-solid p-5 text-sm">
          <div className="font-semibold">Account settings moved</div>
          <div className="mt-1 muted">
            Manage nickname and password reset from{' '}
            <Link className="underline underline-offset-4" href="/account">
              Account
            </Link>
            .
          </div>
        </div>
      </div>
    </main>
  );
}
