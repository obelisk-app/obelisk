export type SignatureResult = 'pending' | 'accepted' | 'rejected';

/** The NIP-42 relay-auth kind: its template is an empty challenge, not a message. */
const AUTH_KIND = 22242;

export interface MockTemplate { kind: number; content: string; tags: string[][] }

/**
 * The harmless event the developer test asks the signer to sign for one
 * kind: a relay-auth challenge for 22242, a tagged dummy message otherwise.
 * Nothing is published.
 */
export function mockSignatureTemplate(kind: number, copy: { content: string; alt: string }): MockTemplate {
  if (kind === AUTH_KIND) {
    return {
      kind,
      content: '',
      tags: [['relay', 'wss://public.obelisk.ar'], ['challenge', 'obelisk-developer-signature-test'], ['client', 'Obelisk']],
    };
  }
  return { kind, content: copy.content, tags: [['client', 'Obelisk'], ['alt', copy.alt]] };
}

/** Every kind waiting for its answer. */
export function pendingSignatures(kinds: readonly number[]): Record<number, SignatureResult> {
  return Object.fromEntries(kinds.map((kind) => [kind, 'pending' as const]));
}

/** How many kinds were asked for, and how many the signer accepted and refused. */
export function signatureTally(results: Readonly<Record<number, SignatureResult>>) {
  const values = Object.values(results);
  return {
    requested: values.length,
    accepted: values.filter((result) => result === 'accepted').length,
    rejected: values.filter((result) => result === 'rejected').length,
  };
}
