import { describe, expect, it } from 'vitest';
import { looksLikeProse, scanFile, scanTree } from '../../scripts/i18n/hardcoded-strings';

/** Migration is complete: no baseline or historical exceptions remain. */
describe('hardcoded user-visible strings', () => {
  it('keeps all production copy translated', () => {
    const findings = Object.values(scanTree('src')).flat();
    expect(findings, 'route copy through t() or mark a legitimate i18n-exempt reason').toEqual([]);
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
