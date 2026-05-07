#!/usr/bin/env node
// Dev launcher: starts `next dev`.
// Bots live in obelisk-app/obelisk-bots — run them from that repo.
import { spawn } from 'node:child_process';

const children = [];

function start(cmd, args, label) {
  const child = spawn(cmd, args, { stdio: 'inherit', env: process.env });
  children.push(child);
  child.on('exit', (code, signal) => {
    console.log(`[${label}] exited (code=${code} signal=${signal})`);
    for (const c of children) if (c !== child && !c.killed) c.kill('SIGTERM');
    process.exit(code ?? 0);
  });
  return child;
}

start('npx', ['next', 'dev'], 'next');

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const c of children) if (!c.killed) c.kill(sig);
  });
}
