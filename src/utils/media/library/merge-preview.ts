import type { JsMediaItem } from '@/services/nostr-bridge';
import { mergePackItems } from './pack-utils';

/** A review report keeps discarded aliases visible alongside the proposed destination. */
export function mediaMergePreview(destination: readonly JsMediaItem[], incoming: readonly JsMediaItem[]) {
  const items = mergePackItems(destination, incoming);
  const retained = new Map(items.map((item) => [item.url, item]));
  const seen = new Set<string>();
  const duplicates: string[] = [];
  const renamed: string[] = [];
  for (const item of [...destination, ...incoming]) {
    const url = new URL(item.url).href;
    if (seen.has(url)) duplicates.push(item.name);
    else if (retained.get(url)?.name !== item.name) renamed.push(item.name);
    seen.add(url);
  }
  return { items, duplicates, renamed, added: items.length - mergePackItems([], destination).length };
}
