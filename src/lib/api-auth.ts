import { NextRequest } from 'next/server';
import { validateSession } from './auth';

export async function getAuthPubkey(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get('session')?.value;
  if (!token) return null;
  return validateSession(token);
}
