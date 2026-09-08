import nodemailer from 'nodemailer';
import { getKv } from '@/lib/kv';

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

function loadSmtpConfig(): SmtpConfig | null {
  const host = (getKv('smtp_host') || process.env.SMTP_HOST || '').trim();
  const portRaw = (getKv('smtp_port') || process.env.SMTP_PORT || '').trim();
  const secureRaw = (getKv('smtp_secure') || process.env.SMTP_SECURE || '').trim().toLowerCase();
  const user = (getKv('smtp_user') || process.env.SMTP_USER || '').trim();
  const pass = (getKv('smtp_pass') || process.env.SMTP_PASS || '').trim();
  const from = (getKv('smtp_from') || process.env.SMTP_FROM || '').trim();

  const port = Number(portRaw || 587);
  const secure = secureRaw === '1' || secureRaw === 'true' || port === 465;

  if (!host || !Number.isFinite(port) || !user || !pass || !from) return null;

  return { host, port, secure, user, pass, from };
}

function appBaseUrl() {
  const envUrl = String(process.env.APP_BASE_URL || '').trim();
  if (envUrl) return envUrl.replace(/\/$/, '');

  const host = getKv('public_hostname');
  if (host) return `https://${host}`;

  return 'http://localhost:3210';
}

function normalizeFromAddress(raw: string) {
  const value = raw.trim();
  if (!value || value.includes('<')) return value;

  const parts = value.split(/\s+/);
  const address = parts.at(-1) ?? '';
  const name = parts.slice(0, -1).join(' ').trim();
  if (name && /^\S+@\S+\.\S+$/.test(address)) return { name, address };

  return value;
}

export function passwordResetUrl(token: string) {
  return `${appBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

export function isSmtpConfigured() {
  return Boolean(loadSmtpConfig());
}

export async function sendPasswordResetEmail(toEmail: string, token: string) {
  const cfg = loadSmtpConfig();
  if (!cfg) return { ok: false as const, error: 'smtp_not_configured' };

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: {
      user: cfg.user,
      pass: cfg.pass,
    },
  });

  const link = passwordResetUrl(token);

  await transporter.sendMail({
    from: normalizeFromAddress(cfg.from),
    to: toEmail,
    subject: 'F1 Predictions - Password reset',
    text: `Use this link to reset your password (valid for 30 minutes):\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>Use this link to reset your password (valid for 30 minutes):</p><p><a href="${link}">${link}</a></p><p>If you did not request this, you can ignore this email.</p>`,
  });

  return { ok: true as const };
}
