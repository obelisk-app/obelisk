import { describe, expect, it } from 'vitest';
import baseline from './hardcoded-baseline.json';
import { countsByFile, looksLikeProse, scanTree } from './hardcoded-strings';

const BASELINE = baseline as Record<string, number>;

/**
 * A ratchet, not a gate.
 *
 * 654 user-visible strings were written straight into JSX and never reached
 * a dictionary — they were English in the Spanish build too, and translating
 * `pt.json` did nothing for them. Banning them outright in one commit would
 * have meant a red suite until all 654 were extracted, so the known set was
 * frozen here and this test fails on any *increase*: a new file with
 * hardcoded copy, or an existing file gaining more.
 *
 * They have since been extracted. What is left in the baseline is exempt on
 * purpose, and each entry is one of:
 *
 *  - **Guide hero SVGs** (`components/guides/svg/**`) — English inside
 *    `<text>` elements that also feed the OG-image snapshot pipeline.
 *    Translating them is a build-pipeline change, not a string swap.
 *  - **Brand names** — "Obelisk", "GitHub", "Nostr WoT", "QuantaKrypto",
 *    and the media kit's typography and pitch specimens, which are the
 *    asset itself rather than copy about it.
 *  - **Scanner misreads** the filter can't distinguish from prose: a
 *    selector string, a sentence inside a code comment.
 *
 * So the number should keep going *down* and never up. When a file leaves
 * the list, delete its line.
 *
 * Regenerate after extracting:
 *   npx tsx -e "…scanTree…"   (see hardcoded-strings.ts)
 */
describe('hardcoded user-visible strings', () => {
  const counts = countsByFile(scanTree('src'));

  it('does not grow in a file that already had some', () => {
    const grew: string[] = [];
    for (const [file, count] of Object.entries(counts)) {
      const allowed = BASELINE[file];
      if (allowed === undefined) continue;
      if (count > allowed) grew.push(`${file}: ${allowed} → ${count}`);
    }
    expect(grew, 'route new copy through t() instead').toEqual([]);
  });

  it('does not appear in a file that had none', () => {
    const fresh = Object.keys(counts).filter((file) => BASELINE[file] === undefined);
    expect(fresh, 'new components must use t() from the start').toEqual([]);
  });

  it('has a baseline that is still accurate', () => {
    // A file that dropped to zero, or was deleted, should leave the
    // baseline — otherwise the ratchet silently loosens over time.
    const stale = Object.keys(BASELINE).filter((file) => (counts[file] ?? 0) === 0);
    expect(stale, 'remove these from hardcoded-baseline.json').toEqual([]);
  });

  it('reports a shrinking total', () => {
    // Not an assertion about the number itself — just proof the scanner is
    // still finding things, so an accidentally-broken regex can't turn the
    // whole ratchet into a no-op that passes.
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const allowed = Object.values(BASELINE).reduce((sum, n) => sum + n, 0);
    expect(total).toBeLessThanOrEqual(allowed);
    expect(allowed).toBeGreaterThan(0);
  });
});

describe('what counts as prose', () => {
  it('catches the copy a reader would notice', () => {
    expect(looksLikeProse('Add relay')).toBe(true);
    expect(looksLikeProse('No messages yet')).toBe(true);
    expect(looksLikeProse('Direct messages')).toBe(true);
    // Single capitalised words are still copy: "Suggested", "Remove".
    expect(looksLikeProse('Remove')).toBe(true);
  });

  it('leaves identifiers and markup alone', () => {
    expect(looksLikeProse('wss://relay.example')).toBe(false);
    expect(looksLikeProse('npub1abc')).toBe(false);
    expect(looksLikeProse('{count}')).toBe(false);
    expect(looksLikeProse('#')).toBe(false);
    expect(looksLikeProse('⋯')).toBe(false);
    expect(looksLikeProse('px')).toBe(false);
    expect(looksLikeProse('@')).toBe(false);
    expect(looksLikeProse('data-testid')).toBe(false);
  });
});
