import { NextResponse } from 'next/server';
import { syncSeasonData } from '@/lib/f1/sync';

function assertCronAuth(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new Error('Cron disabled');
  const header = request.headers.get('x-cron-secret');
  if (header !== secret) throw new Error('Unauthorized');
}

export async function POST(request: Request) {
  try {
    assertCronAuth(request);
    const url = new URL(request.url);
    const seasonYear = Number(url.searchParams.get('season') ?? new Date().getUTCFullYear());

    const res = await syncSeasonData(seasonYear);
    return NextResponse.json({ ok: true, seasonYear, ...res });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? 'Unknown error' }, { status: 401 });
  }
}
