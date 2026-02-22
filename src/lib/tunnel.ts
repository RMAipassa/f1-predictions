import { spawn } from 'node:child_process';
import { getKv } from '@/lib/kv';

declare global {
  // eslint-disable-next-line no-var
  var __F1P_TUNNEL_STARTED__: boolean | undefined;
}

export function maybeStartCloudflared() {
  if (globalThis.__F1P_TUNNEL_STARTED__) return;

  const token = getKv('cloudflared_token');
  if (!token) return;

  const bin = process.env.CLOUDFLARED_PATH || 'cloudflared';
  try {
    spawn(bin, ['tunnel', '--no-autoupdate', 'run', '--token', token], {
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env },
      detached: true,
    }).unref();
    globalThis.__F1P_TUNNEL_STARTED__ = true;
  } catch {
    // Ignore.
  }
}
