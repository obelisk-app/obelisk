/**
 * The bridge handle and watchdog shared by the game publishers
 * (`transport-publish.ts`) and the channel subscription (`transport.ts`).
 */
import { getBridge, getBridgeImpl } from '@/services/nostr-bridge';

export const GAME_SUB_WATCHDOG_MS = 4000;

export async function bridge() {
  await getBridge();
  const impl = getBridgeImpl();
  if (!impl) throw new Error('nostr bridge not initialized');
  return impl;
}
