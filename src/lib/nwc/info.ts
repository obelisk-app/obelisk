/**
 * The wallet service's info event (NIP-47, kind 13194): which methods this
 * connection may call, and which encryption the wallet speaks.
 *
 * The content is the methods, space-separated. An `encryption` tag lists
 * the schemes (`nip44_v2 nip04`); a wallet that publishes none speaks only
 * NIP-04, as the spec says.
 *
 * No app imports: a mini-package.
 */
import type { Event as NostrEvent } from 'nostr-tools';

/** NIP-47's event kinds. The app's `src/utils/nostr/nip-kinds.ts` names the same numbers; a test pins them equal. */
export const NWC_KINDS = { info: 13194, request: 23194, response: 23195 } as const;

export type NwcEncryption = 'nip44_v2' | 'nip04';

export interface NwcInfo {
  readonly methods: readonly string[];
  readonly encryptions: readonly NwcEncryption[];
}

function words(value: string | undefined): string[] {
  return (value ?? '').split(/[\s,]+/).map((w) => w.trim()).filter(Boolean);
}

export function parseNwcInfo(event: Pick<NostrEvent, 'content' | 'tags'>): NwcInfo {
  const methods = words(event.content);
  const tag = event.tags.find((t) => t[0] === 'encryption');
  const listed = words(tag?.[1]).filter((w): w is NwcEncryption => w === 'nip44_v2' || w === 'nip04');
  return { methods, encryptions: tag ? listed : ['nip04'] };
}

/** NIP-44 when the wallet offers it, else NIP-04 (which every wallet speaks). */
export function chooseEncryption(info: NwcInfo): NwcEncryption {
  return info.encryptions.includes('nip44_v2') ? 'nip44_v2' : 'nip04';
}

export function canPay(info: NwcInfo): boolean {
  return info.methods.includes('pay_invoice');
}
