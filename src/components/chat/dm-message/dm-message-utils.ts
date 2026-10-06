import { hexToNpub } from '@nostr-wot/data';
import { extractUrls, isImageUrl } from '@/utils/message-text/markdown';
import type { DmRawEvent, JsDirectMessage } from '@/services/nostr-bridge/types';
import { useToastStore } from '@/store/toast';

/** The npub for a pubkey, or the input itself when it does not encode. */
export function safeNpub(pubkey: string): string {
  try {
    return hexToNpub(pubkey);
  } catch {
    return pubkey;
  }
}

/** Copy (best effort) and confirm with a toast titled `message`. */
export function copy(value: string, message: string) {
  // `Promise.resolve`: a clipboard shim may return undefined.
  void Promise.resolve(navigator.clipboard?.writeText(value)).catch(() => {});
  useToastStore.getState().pushToast({ title: message, body: '' });
}

/** An event as indented JSON, for the raw view and its copy button. */
export const json = (ev: DmRawEvent) => JSON.stringify(ev, null, 2);

/**
 * What the raw-event dialog needs to know about a DM: the rumor (only
 * NIP-17 has one), the event on the relay, whether the rumor carries a
 * file's decryption key, and whether this is a legacy NIP-04 message.
 */
export function rawEventFacts(message: JsDirectMessage) {
  const rumor = message.raw?.rumor;
  const wire = message.raw?.wire;
  return {
    rumor,
    wire,
    holdsKey: Boolean(rumor?.tags.some((tag) => tag[0] === 'decryption-key')),
    nip04: message.protocol === 'nip04' || wire?.kind === 4,
  };
}

/** Most images a DM shows inline. */
const DM_IMAGE_LIMIT = 4;

/**
 * The first four bare image URLs in a DM, and its text with them cut out
 * and the blank lines they leave collapsed.
 */
export function splitDmImages(content: string): { images: string[]; text: string } {
  const images = extractUrls(content).filter(isImageUrl).slice(0, DM_IMAGE_LIMIT);
  let text = content;
  for (const url of images) text = text.split(url).join('');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return { images, text };
}
