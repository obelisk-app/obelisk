import { nostrActions } from '@/services/nostr-bridge';
import type { MockTemplate, SignatureResult } from '@/utils/settings/signature-test';

/**
 * Ask the signer to sign one harmless template per kind, all at once, and
 * report each answer as it comes. Resolves when every kind has answered;
 * nothing is published.
 */
export async function requestMockSignatures(
  kinds: readonly number[],
  templateFor: (kind: number) => MockTemplate,
  onResult: (kind: number, result: SignatureResult) => void,
): Promise<void> {
  await Promise.all(kinds.map(async (kind) => {
    try {
      await nostrActions.signEventTemplate(templateFor(kind));
      onResult(kind, 'accepted');
    } catch {
      onResult(kind, 'rejected');
    }
  }));
}
