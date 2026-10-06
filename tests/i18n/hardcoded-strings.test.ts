import { describe, expect, it } from 'vitest';
import baseline from '@/i18n/hardcoded-baseline.json';
import { countsByFile, looksLikeProse, scanFile, scanTree } from '@/i18n/hardcoded-strings';

const BASELINE = baseline as Record<string, number>;

/**
 * A ratchet, not a gate.
 *
 * Copy written straight into the source is English in every language. The
 * scanner (src/i18n/hardcoded-strings.ts, rules in src/i18n/hardcoded/)
 * reads JSX text, reader-facing attributes and their expressions, object
 * copy, toasts and dialogs, ternaries, fallbacks, templates, `.ts` files,
 * and prose in src/lib; comments are stripped first. Round 18 widened it
 * from "JSX text and five quoted attributes" to all of that, and the
 * baseline was regenerated honestly: several hundred strings, owned by the
 * translation waves listed in audits/obelisk/round18/I18N-WAVE2.md.
 *
 * The number may only go down: a new file with hardcoded copy, or an
 * existing file gaining more, fails. Text that legitimately stays (brand
 * names, protocol terms, artwork that feeds the OG snapshots, type
 * specimens) carries an `i18n-exempt: <reason>` marker on its line instead
 * of a baseline entry, so the baseline can reach an empty object.
 *
 * After moving strings to the messages, regenerate (never hand-merge):
 *   npx tsx scripts/i18n/hardcoded-baseline.ts
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
    // baseline, otherwise the ratchet silently loosens over time.
    const stale = Object.keys(BASELINE).filter((file) => (counts[file] ?? 0) === 0);
    expect(stale, 'remove these from hardcoded-baseline.json').toEqual([]);
  });

  it('keeps the total at or under the baseline, which is now zero', () => {
    // Proof that the scanner still finds things (so a broken regex cannot
    // pass vacuously) lives in 'the scanner rules' below, which feeds it
    // known strings. The baseline reached zero in round 19.
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const allowed = Object.values(BASELINE).reduce((sum, n) => sum + n, 0);
    expect(total).toBeLessThanOrEqual(allowed);
    expect(allowed).toBe(0);
  });
});

describe('the scanner rules', () => {
  const texts = (source: string, file = 'components/x/Foo.tsx') => scanFile(file, source).map((f) => f.text);

  it('reads JSX text and quoted reader-facing attributes', () => {
    expect(texts('const a = <p title="Remove relay">No messages yet</p>;').sort()).toEqual(['No messages yet', 'Remove relay']);
  });

  it('reads literals inside attribute expressions, ternaries and templates included', () => {
    expect(texts("const a = <b aria-label={muted ? 'Unmute' : 'Mute'} />;")).toEqual(expect.arrayContaining(['Unmute', 'Mute']));
    expect(texts('const a = <b title={`Grant ${role} to ${name}`} />;')).toEqual(expect.arrayContaining(['Grant']));
  });

  it('reads copy-shaped object keys, in .ts files too', () => {
    expect(texts("export const X = { label: 'Add relay', id: 'add' };", 'utils/x.ts')).toEqual(['Add relay']);
    expect(texts("export const X = { name: 'relay' };", 'utils/x.ts')).toEqual([]);
  });

  it('reads toast, dialog and error-setter arguments', () => {
    expect(texts("pushToast({ title: 'Saved', body: 'Your layout is live' });", 'hooks/x.ts')).toEqual(expect.arrayContaining(['Saved', 'Your layout is live']));
    expect(texts("setError('Upload failed');", 'hooks/x.ts')).toEqual(['Upload failed']);
  });

  it('reads ternaries and fallbacks, but not class names', () => {
    expect(texts("const s = online ? 'Online' : 'Offline';", 'utils/x.ts')).toEqual(['Online', 'Offline']);
    expect(texts("const n = name || 'Anonymous';", 'utils/x.ts')).toEqual(['Anonymous']);
    expect(texts("const c = <b className={on ? 'text-lc-green font-bold' : 'text-lc-muted'} />;")).toEqual([]);
  });

  it('reads capitalised template prose, not paths or t() keys', () => {
    expect(texts('const s = `Connecting to ${host}`;', 'utils/x.ts')).toEqual(['Connecting to']);
    expect(texts('const p = `/guides/${slug}`; const k = t(`social.filter.${v}`);', 'utils/x.ts')).toEqual([]);
  });

  it('ignores comments and message keys', () => {
    expect(texts("// Shows the Welcome Screen here\nconst k = t('shell.desktop.title');", 'utils/x.ts')).toEqual([]);
    expect(texts("/* A Long Sentence In A Comment */ const a = 1;", 'utils/x.ts')).toEqual([]);
  });

  it('treats any prose literal in src/lib as copy, except errors and logs', () => {
    expect(texts("export const RULES = ['Roll first'];", 'lib/games/x.ts')).toEqual(['Roll first']);
    expect(texts("throw new Error('Something Broke Badly');", 'lib/x.ts')).toEqual([]);
  });

  it('honours a per-line i18n-exempt marker with a reason', () => {
    expect(texts('const a = <text>Relay Hero Label</text>; {/* i18n-exempt: artwork */}')).toEqual([]);
    expect(texts('const a = <text>Relay Hero Label</text>; {/* i18n-exempt: */}')).toEqual(['Relay Hero Label']);
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
    expect(looksLikeProse('shell.desktop.channel.welcome')).toBe(false);
    expect(looksLikeProse('px-3 py-1 text-lc-muted')).toBe(false);
    expect(looksLikeProse('rgba(180, 249, 83, 0.08)')).toBe(false);
    expect(looksLikeProse('Obelisk')).toBe(false);
    expect(looksLikeProse('DesktopShell')).toBe(false);
  });
});
