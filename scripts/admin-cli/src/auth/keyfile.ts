import fs from 'fs';
import path from 'path';
import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { ensureConfigDir } from '../config';

/**
 * Generate a fresh Nostr keypair and write the `nsec1…` to `outPath`
 * at mode 0600. Returns only the public artifacts so the caller can
 * safely log / echo them. The secret bytes never leave this function.
 *
 * Refuses to overwrite an existing file unless `force` is set.
 */
export function generateKeyFile(
  outPath: string,
  opts: { force?: boolean } = {},
): { path: string; npub: string; pubkeyHex: string } {
  if (!opts.force && fs.existsSync(outPath)) {
    throw new Error(
      `Refusing to overwrite existing key file at ${outPath} — pass --force to rotate`,
    );
  }

  // Ensure parent dir exists with tight perms. For the default config dir
  // reuse the helper; for arbitrary paths, mkdir -p on the parent.
  const parent = path.dirname(outPath);
  if (parent.endsWith(path.join('.config', 'obelisk-cli'))) {
    ensureConfigDir();
  } else {
    fs.mkdirSync(parent, { recursive: true });
  }

  const secret = generateSecretKey();
  const nsec = nip19.nsecEncode(secret);
  const pubkeyHex = getPublicKey(secret);
  const npub = nip19.npubEncode(pubkeyHex);

  // Write the key, then chmod — writeFileSync's `mode` only applies when
  // creating the file; belt-and-suspenders with chmodSync.
  fs.writeFileSync(outPath, nsec + '\n', { mode: 0o600 });
  try { fs.chmodSync(outPath, 0o600); } catch { /* best effort */ }

  return { path: outPath, npub, pubkeyHex };
}

/**
 * Read an nsec (or 64-char hex secret) from disk. Strips whitespace.
 * Never echoes file contents on error.
 */
export function readKeyFile(filePath: string): string {
  let contents: string;
  try {
    contents = fs.readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(`unable to read key file at ${filePath}`);
  }
  const trimmed = contents.trim();
  if (!trimmed) {
    throw new Error(`key file at ${filePath} is empty`);
  }
  return trimmed;
}
