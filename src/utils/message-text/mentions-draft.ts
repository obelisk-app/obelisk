/**
 * Composer-side mentions: spotting an open `@query` slot, inserting a picked
 * member as readable `@Name` text, and turning those tokens back into
 * `nostr:npub1...` just before publishing. Re-exported from `mentions.ts`.
 */
import { hexToNpub } from '@nostr-wot/data';

/**
 * Detect an in-progress `@`-mention query at the cursor. Returns the partial
 * username typed after the most recent `@` (possibly empty), or `null` when
 * the cursor is not currently sitting in a mention slot.
 *
 * Matches `@` at start-of-input or after whitespace so emails/handles inside
 * words don't trigger the popup. Word characters only - once the user types
 * anything else, the slot closes.
 */
export function detectMentionQuery(value: string, cursor: number): string | null {
  const before = value.slice(0, cursor);
  const m = before.match(/(?:^|\s)@(\w*)$/);
  return m ? m[1] : null;
}

/**
 * A mention the composer is holding as readable `@Name` text, plus the
 * pubkey it must be turned back into before the event is published.
 */
export interface DraftMention {
  /** Exact literal inserted into the draft, e.g. `@Fabricio Acosta`. */
  readonly token: string;
  readonly pubkey: string;
}

/**
 * Insert a mention at `cursor`, replacing the in-progress `@query` slot if
 * one is open. Returns the new draft, the caret position after the inserted
 * token, and - for prose mentions - the {@link DraftMention} the caller must
 * keep so {@link resolveDraftMentions} can restore the npub at send time.
 *
 * Two token shapes, deliberately:
 *
 * - **Prose** (`displayName` given, no `slotRange`) inserts `@Display Name`.
 *   A composer is a plain `<input>` and cannot render a chip, so pasting a
 *   63-character `nostr:npub1…` into the middle of a sentence is the only
 *   thing the user would see. They type prose; they should read prose.
 * - **Slash-command slot** (`slotRange` given) keeps `nostr:npub1…`. Those
 *   slots are machine-parsed and whitespace-tokenized by
 *   `SlashCommandScaffold`, so a display name containing a space would split
 *   into two arguments and the command would resolve the wrong user.
 *
 * `slotRange` is the absolute char range of the slot's existing token.
 * Without it a partial name typed into the slot would be left in place and
 * the token appended after it - `/zap dum nostr:npub…`, which the parser
 * rejects as an unknown user.
 */
export function applyMentionToDraft(
  draft: string,
  cursor: number,
  pubkey: string,
  opts?: {
    displayName?: string | null;
    slotRange?: { start: number; end: number } | null;
  },
): { next: string; cursor: number; mention: DraftMention | null } {
  const slotRange = opts?.slotRange ?? null;
  const displayName = opts?.displayName ?? null;
  // Slash slots must stay machine-readable; prose gets the readable form.
  const useProse = !slotRange && !!displayName;
  const bare = useProse ? `@${displayName}` : `nostr:${hexToNpub(pubkey)}`;
  const token = `${bare} `;
  const mention: DraftMention | null = useProse ? { token: bare, pubkey } : null;

  if (slotRange) {
    const replaced = draft.slice(0, slotRange.start) + token + draft.slice(slotRange.end);
    return { next: replaced, cursor: slotRange.start + token.length, mention };
  }

  const before = draft.slice(0, cursor);
  const after = draft.slice(cursor);
  let replaced: string;
  if (/@(\w*)$/.test(before)) {
    replaced = before.replace(/@(\w*)$/, () => token);
  } else {
    const sep = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
    replaced = before + sep + token;
  }
  return { next: replaced + after, cursor: replaced.length, mention };
}

/**
 * Turn the composer's readable `@Name` tokens back into `nostr:npub1…`
 * immediately before publishing.
 *
 * This has to happen: `#p` tags and mention notifications are both derived
 * from `nostr:` tokens in the event content (see
 * `extractMentionPubkeysFromMessage`), and every other Nostr client needs
 * the NIP-19 form to link the mention at all.
 *
 * Longest token first, so `@Fab` cannot eat the prefix of `@Fabricio`.
 * Replacement is literal, not regex, so names containing `.` `(` `+` etc.
 * are safe. A token the user has since edited simply no longer matches and
 * is left as written - the mention degrades to plain text rather than
 * resolving to the wrong person.
 */
export function resolveDraftMentions(
  text: string,
  mentions: ReadonlyArray<DraftMention>,
): string {
  if (mentions.length === 0) return text;
  const seen = new Set<string>();
  const ordered = [...mentions]
    .filter((m) => {
      const key = `${m.token}\x00${m.pubkey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.token.length - a.token.length);

  let out = text;
  for (const m of ordered) {
    if (!out.includes(m.token)) continue;
    // split/join is a literal replace-all - no regex escaping to get wrong.
    out = out.split(m.token).join(`nostr:${hexToNpub(m.pubkey)}`);
  }
  return out;
}
