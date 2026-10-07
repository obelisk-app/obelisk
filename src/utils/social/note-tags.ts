import type { Event as NostrEvent } from 'nostr-tools';

/** The value of a note's first tag named `name`, if it has one. */
export function tagValue(note: Pick<NostrEvent, 'tags'>, name: string): string | undefined {
  return note.tags.find((tag) => tag[0] === name)?.[1];
}
