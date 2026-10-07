import { useMemo } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { embeddedRepostEvent, repostTarget } from '@/services/social/repost';
import { bodyClickHandler } from '@/utils/social/note-card';
import { uniqueReposters } from '@/utils/social/reposters';

/**
 * A repost row's view model: the verified embedded note (or null), the
 * target from the `e` tag, everyone who reposted it, and the row's click.
 *
 * `embeddedRepostEvent` only returns a note whose signature verifies and
 * whose id matches the wrapper's `e` tag; the pool never saw the inner
 * event, so this is where it gets checked. A forged blob comes back null and
 * the row falls through to the e-tag button, which opens the real note by
 * id. Memoised per card on top of the module-level memo in `repost.ts`, so a
 * feed re-render costs no schnorr verification.
 */
export function useRepostCard({
  note,
  reposters,
  onOpenNote,
}: {
  note: NostrEvent;
  reposters?: readonly string[];
  onOpenNote?: (id: string) => void;
}) {
  const inner = useMemo(() => embeddedRepostEvent(note), [note]);
  const target = useMemo(() => repostTarget(note), [note]);
  // The row's own author first, then anyone else who reposted the same note.
  const everyone = useMemo(() => uniqueReposters(note.pubkey, reposters), [note.pubkey, reposters]);
  const openId = inner?.id ?? target?.id;

  return {
    inner,
    everyone,
    /**
     * The reposted note is the content of this row, so the row opens it. The
     * inner card renders with `nested` and has no handler of its own, so this
     * is the single owner of a body click, and `bodyClickHandler` steps aside
     * for the real controls inside, including the inner timestamp button.
     */
    openReposted: bodyClickHandler(onOpenNote && openId ? () => onOpenNote(openId) : undefined),
    /** The fallback button for a repost whose embed is missing or failed verification. */
    openTarget: () => {
      if (target) onOpenNote?.(target.id);
    },
  };
}
