import { NextResponse } from 'next/server';
import { generateChallenge } from '@/lib/auth';

export async function POST() {
  const { challengeId, challenge } = generateChallenge();
  return NextResponse.json({ challengeId, challenge });
}
