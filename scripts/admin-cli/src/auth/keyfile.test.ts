import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { verifyEvent } from 'nostr-tools/pure';
import { generateKeyFile, readKeyFile } from './keyfile';
import { decodeNsec, signChallengeWithNsec } from './signer-nsec';

function tmpPath(): string {
  return path.join(os.tmpdir(), `obelisk-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}.nsec`);
}

describe('generateKeyFile', () => {
  it('writes a 0600 file whose nsec round-trips through sign + verify', () => {
    const p = tmpPath();
    try {
      const out = generateKeyFile(p);
      const stat = fs.statSync(p);
      expect(stat.mode & 0o777).toBe(0o600);
      expect(out.path).toBe(p);
      expect(out.npub.startsWith('npub1')).toBe(true);
      expect(out.pubkeyHex).toMatch(/^[0-9a-f]{64}$/);

      const secret = decodeNsec(readKeyFile(p));
      const signed = signChallengeWithNsec(secret, 'obelisk-auth:abc:1');
      expect(verifyEvent(signed as any)).toBe(true);
      expect(signed.pubkey).toBe(out.pubkeyHex);
    } finally {
      try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
  });

  it('refuses to overwrite an existing file without force', () => {
    const p = tmpPath();
    try {
      generateKeyFile(p);
      expect(() => generateKeyFile(p)).toThrow(/Refusing to overwrite/);
    } finally {
      try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
  });

  it('overwrites when force is true', () => {
    const p = tmpPath();
    try {
      const first = generateKeyFile(p);
      const second = generateKeyFile(p, { force: true });
      expect(second.pubkeyHex).not.toBe(first.pubkeyHex);
    } finally {
      try { fs.unlinkSync(p); } catch { /* ignore */ }
    }
  });

  it('readKeyFile reports a clean error for a missing path (no contents leak)', () => {
    const p = path.join(os.tmpdir(), 'definitely-not-here.nsec');
    expect(() => readKeyFile(p)).toThrow(/unable to read key file/);
  });
});
