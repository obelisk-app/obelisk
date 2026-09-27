/**
 * Fetching an app's files from Blossom, verified.
 *
 * Every file is addressed by the sha256 the session's `create` pinned, so the
 * server is untrusted: whatever it returns is hashed here and refused unless
 * it matches. That's what lets any Blossom server — ours, a public one, a
 * hostile one — serve app code without being able to change it.
 *
 * Verified bytes are kept in Cache Storage under their hash (immutable by
 * definition), so the second open of an app costs no network. The MIME type
 * comes from the pinned path's extension, never from the server's
 * Content-Type.
 *
 * Fetching from Blossom reveals the user's IP and the app hash to that
 * server — the same exposure as an image attachment (docs/apps.md).
 */

export const DEFAULT_APP_BLOB_SERVERS = ['https://blossom.obelisk.ar', 'https://nostr.download'];
/** Per file. Matches blossom.obelisk.ar's upload cap with headroom. */
export const MAX_APP_FILE_BYTES = 32 * 1024 * 1024;
const CACHE_NAME = 'obelisk-app-blobs-v1';
const FETCH_TIMEOUT_MS = 20_000;

const MIME: Record<string, string> = {
  js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json',
  wasm: 'application/wasm', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', mp3: 'audio/mpeg', ogg: 'audio/ogg',
  wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', webm: 'video/webm', woff2: 'font/woff2',
  woff: 'font/woff', ttf: 'font/ttf', txt: 'text/plain',
};

export function mimeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? 'application/octet-stream';
}

export class BlobUnavailableError extends Error {
  constructor(readonly sha256: string, readonly tried: string[]) {
    super(`No server returned ${sha256.slice(0, 12)}… (tried ${tried.length})`);
    this.name = 'BlobUnavailableError';
  }
}

async function digestHex(bytes: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const memory = new Map<string, ArrayBuffer>();
const inflight = new Map<string, Promise<ArrayBuffer>>();

async function fromCacheStorage(sha256: string): Promise<ArrayBuffer | null> {
  try {
    if (typeof caches === 'undefined') return null;
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(`https://blob.invalid/${sha256}`);
    if (!hit) return null;
    const bytes = await hit.arrayBuffer();
    // A cache is storage the user's browser controls; still, never hand over
    // bytes we haven't re-checked.
    return (await digestHex(bytes)) === sha256 ? bytes : null;
  } catch {
    return null;
  }
}

async function toCacheStorage(sha256: string, bytes: ArrayBuffer): Promise<void> {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(`https://blob.invalid/${sha256}`, new Response(bytes));
  } catch { /* quota or private mode: the memory copy still serves this page */ }
}

async function fetchVerified(sha256: string, servers: readonly string[], fetchImpl: typeof fetch): Promise<ArrayBuffer> {
  const tried: string[] = [];
  for (const server of servers) {
    tried.push(server);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetchImpl(`${server}/${sha256}`, { signal: ctrl.signal, referrerPolicy: 'no-referrer', credentials: 'omit' });
      if (!res.ok) continue;
      const declared = Number(res.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > MAX_APP_FILE_BYTES) continue;
      const bytes = await res.arrayBuffer();
      if (bytes.byteLength > MAX_APP_FILE_BYTES) continue;
      if ((await digestHex(bytes)) !== sha256) continue; // a lying server is just a missing one
      return bytes;
    } catch {
      /* next server */
    } finally {
      clearTimeout(timer);
    }
  }
  throw new BlobUnavailableError(sha256, tried);
}

/**
 * The verified bytes for `sha256`, from memory, Cache Storage, or the first
 * server in `servers` (then the defaults) that returns matching bytes.
 */
export async function loadBlob(
  sha256: string,
  servers: readonly string[] = [],
  fetchImpl: typeof fetch = fetch,
): Promise<ArrayBuffer> {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('not a sha256');
  const mem = memory.get(sha256);
  if (mem) return mem;
  const pending = inflight.get(sha256);
  if (pending) return pending;

  const p = (async () => {
    const cached = await fromCacheStorage(sha256);
    if (cached) return cached;
    const all = [...new Set([...servers, ...DEFAULT_APP_BLOB_SERVERS])];
    const bytes = await fetchVerified(sha256, all, fetchImpl);
    void toCacheStorage(sha256, bytes);
    return bytes;
  })();
  inflight.set(sha256, p);
  try {
    const bytes = await p;
    memory.set(sha256, bytes);
    return bytes;
  } finally {
    inflight.delete(sha256);
  }
}

/** A pinned path as a Blob with its path-derived type. */
export async function loadPathBlob(
  path: { path: string; sha256: string },
  servers: readonly string[] = [],
  fetchImpl: typeof fetch = fetch,
): Promise<Blob> {
  return new Blob([await loadBlob(path.sha256, servers, fetchImpl)], { type: mimeForPath(path.path) });
}

/** Test seam. */
export function clearBlobMemory(): void {
  memory.clear();
  inflight.clear();
}
