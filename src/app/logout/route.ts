import { NextResponse } from 'next/server';
import { signOut } from '@/lib/auth';

export async function POST(request: Request) {
  await signOut();
  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
