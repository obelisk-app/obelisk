/**
 * Hex and random-id helpers. `hexToBytes` is deliberately lenient (an
 * invalid digit parses as 0 rather than throwing), matching the behaviour
 * the bridge has relied on; `@noble/hashes` would throw, so swapping it in
 * is a behaviour change to make on purpose.
 */

/** `bytes` cryptographically random bytes as lowercase hex, with a Math.random fallback off-browser. */
function randomHex(bytes: number): string {
  const out = new Uint8Array(bytes);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(out);
  } else {
    for (let i = 0; i < out.length; i++) out[i] = Math.floor(Math.random() * 256);
  }
  return bytesToHex(out);
}

/** NIP-29 group id: 16 hex chars (64 bits) of randomness. */
export function generateGroupId(): string {
  return randomHex(8);
}

/**
 * Opaque client-side tag for an optimistic message placeholder. Lives in
 * the message's `clientTag` field and is mirrored as `pending:<tag>` in the
 * `id` field while the publish is in flight. 16 hex chars = 64 bits of
 * entropy: more than enough to avoid collisions across the few hundred
 * placeholders a session might accumulate.
 */
export function generateClientTag(): string {
  return randomHex(8);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('invalid hex');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}
