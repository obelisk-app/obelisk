/** Build and start the production server for the crawl, and stop it after. */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import net from 'node:net';

export function build(): void {
  console.log('Building (npm run build)...');
  const res = spawnSync('npm', ['run', 'build'], { stdio: 'inherit' });
  if (res.status !== 0) throw new Error(`npm run build exited ${res.status}`);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export type Server = { base: string; stop: () => void };

/** `next start` on a free local port; resolves once robots.txt answers. */
export async function start(): Promise<Server> {
  const port = await freePort();
  const child: ChildProcess = spawn('npx', ['next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: true,
  });
  const base = `http://127.0.0.1:${port}`;
  const stop = () => {
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  };
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/robots.txt`);
      if (res.ok) return { base, stop };
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  stop();
  throw new Error('next start did not answer within 60 s');
}
