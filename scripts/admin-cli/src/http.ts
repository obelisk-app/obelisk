import { loadSession, saveSession, SessionFile } from './config';

export class ApiError extends Error {
  constructor(public status: number, public bodyText: string, public bodyJson: any) {
    super(`HTTP ${status}: ${bodyJson?.error ?? bodyText.slice(0, 200)}`);
  }
}

export type HttpCtx = {
  baseUrl: string;
  cookie?: string;
};

export function ctxFromSession(): HttpCtx {
  const s = loadSession();
  if (!s) throw new Error('Not logged in. Run: obelisk-admin login --nsec <nsec> (or --bunker <uri>)');
  return { baseUrl: s.baseUrl, cookie: s.cookie };
}

export function ctxFromBase(baseUrl: string): HttpCtx {
  return { baseUrl };
}

export async function request<T = any>(
  ctx: HttpCtx,
  method: string,
  pathname: string,
  body?: any,
  opts: { captureCookie?: boolean } = {}
): Promise<{ data: T; res: Response; setCookie: string | null }> {
  const url = ctx.baseUrl.replace(/\/$/, '') + pathname;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (ctx.cookie) headers['Cookie'] = ctx.cookie;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });

  const setCookie = opts.captureCookie ? (res.headers.get('set-cookie') ?? null) : null;
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }

  if (!res.ok) throw new ApiError(res.status, text, json);
  return { data: json as T, res, setCookie };
}

export function extractSessionCookie(setCookieHeader: string | null): string | null {
  if (!setCookieHeader) return null;
  // Node's fetch folds multiple Set-Cookie headers with ", ". Find "session=".
  const match = setCookieHeader.match(/(?:^|,\s*)(session=[^;]+)/);
  return match ? match[1] : null;
}

export function persistCookie(baseUrl: string, pubkey: string, cookie: string): SessionFile {
  const session: SessionFile = { baseUrl, pubkey, cookie, savedAt: Date.now() };
  saveSession(session);
  return session;
}
