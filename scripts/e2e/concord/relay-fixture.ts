import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { Relay, finalizeEvent, generateSecretKey } from 'nostr-tools';
import type { FreshIdentity } from '../lib';
import type { BrowserContext } from '@playwright/test';

/** Real Rust relay, isolated loopback port/database and fresh test-only identities. */
export async function startNip29Fixture(owner: FreshIdentity, member: FreshIdentity) {
  const directory = await mkdtemp(join(tmpdir(), 'obelisk-nip29-e2e-'));
  const name = `obelisk-nip29-e2e-${Date.now()}`;
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  const url = `ws://127.0.0.1:${port}`;
  const advertised = 'wss://nip29-regression.obelisk.ar';
  const config = join(directory, 'config');
  await mkdir(config);
  await writeFile(join(config, 'settings.yml'), JSON.stringify({ relay: {
    relay_secret_key: Buffer.from(generateSecretKey()).toString('hex'),
    local_addr: '0.0.0.0:8080', relay_url: advertised, db_path: '/app/db',
    whitelisted_pubkeys: [owner.pkHex, member.pkHex], admin_pubkeys: [owner.pkHex],
    max_subscriptions: 100, max_limit: 500,
  } }), { mode: 0o600 });
  const stop = async () => {
    try { execFileSync('docker', ['rm', '-f', name], { stdio: 'ignore' }); } catch { /* May already have exited. */ }
    await rm(directory, { recursive: true, force: true });
  };
  try {
    execFileSync('docker', ['run', '--rm', '-d', '--name', name,
      '-p', `127.0.0.1:${port}:8080`, '--mount', `type=bind,src=${config},dst=/app/config`,
      '--tmpfs', '/app/db', 'ghcr.io/obelisk-app/obelisk-relay:v2026.10.29-invite-allowance'], { stdio: 'ignore' });
    const deadline = Date.now() + 20_000;
    let reachable = false;
    while (Date.now() < deadline) {
      try { await fetch(`http://127.0.0.1:${port}`, { signal: AbortSignal.timeout(1000) }); reachable = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
    }
    if (!reachable) throw new Error('Test relay did not start');
    const relay = new Relay(url);
    const secret = Uint8Array.from(Buffer.from(owner.skHex, 'hex'));
    let challenged = () => {};
    const challenge = new Promise<void>(resolve => { challenged = resolve; });
    const signAuth = async (template: Parameters<typeof finalizeEvent>[0]) => finalizeEvent({ ...template, tags: template.tags.map(tag => tag[0] === 'relay' ? ['relay', advertised] : tag) }, secret);
    relay.onauth = async template => { challenged(); return signAuth(template); };
    await relay.connect();
    try {
      await challenge;
      await relay.auth(signAuth);
      const publish = (kind: number, tags: string[][]) => relay.publish(finalizeEvent({ kind, tags, content: '', created_at: Math.floor(Date.now() / 1000) }, secret));
      await publish(9007, [['h', 'concord-regression'], ['name', 'concord-regression'], ['public'], ['open']]);
      await publish(9000, [['h', 'concord-regression'], ['p', member.pkHex]]);
    } finally { relay.close(); }
    const route = async (context: BrowserContext) => {
      await context.route('https://nip29-regression.obelisk.ar/**', async request => {
        const path = new URL(request.request().url());
        const response = await request.fetch({ url: `http://127.0.0.1:${port}${path.pathname}${path.search}` });
        await request.fulfill({ response });
      });
      await context.routeWebSocket('wss://nip29-regression.obelisk.ar/**', socket => {
        const upstream = new WebSocket(url);
        const queued: Array<string | Buffer> = [];
        socket.onMessage(data => { if (upstream.readyState === WebSocket.OPEN) upstream.send(data); else queued.push(data); });
        upstream.onopen = () => { for (const data of queued) upstream.send(data); queued.length = 0; };
        upstream.onmessage = event => socket.send(event.data);
        upstream.onclose = () => socket.close();
        socket.onClose(() => upstream.close());
      });
    };
    return { url: advertised, route, stop };
  } catch (error) { await stop(); throw error; }
}
