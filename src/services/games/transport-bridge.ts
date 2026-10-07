/**
 * The bridge handle and watchdog shared by the game publishers
 * (`transport-publish.ts`) and the channel subscription (`transport.ts`).
 */
import { getBridge, getBridgeImpl } from '@/services/nostr-bridge';

export async function bridge() {
  await getBridge();
  const impl = getBridgeImpl();
  if (!impl) throw new Error('nostr bridge not initialized');
  return impl;
}
