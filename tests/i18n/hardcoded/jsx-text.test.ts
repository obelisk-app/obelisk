import { describe, expect, it } from 'vitest';
import { scanFile } from '@/i18n/hardcoded-strings';

/**
 * JSX text the line regex never saw. Every case here passed the old
 * scanner with nothing reported (or only fragments); the `/voice` page
 * shipped an English paragraph of the first shape with a baseline of zero.
 */
const scan = (source: string) => scanFile('components/x/Foo.tsx', source);
const texts = (source: string) => scan(source).map((f) => f.text);

describe('JSX text across lines and inline elements', () => {
  it('reads a paragraph that wraps across lines, at its first line', () => {
    const source = [
      'export const A = () => (',
      '  <p className="text-lc-muted">',
      '    Voice runs peer to peer, so everyone in the room',
      '    can see your IP address.',
      '  </p>',
      ');',
    ].join('\n');
    expect(scan(source).map((f) => [f.line, f.text])).toEqual([
      [3, 'Voice runs peer to peer, so everyone in the room can see your IP address.'],
    ]);
  });

  it("joins text split by {' '} into one sentence", () => {
    const source = "const a = (\n  <p>\n    Read the guide{' '}\n    first.\n  </p>\n);";
    expect(texts(source)).toEqual(['Read the guide first.']);
  });

  it('joins text around inline elements instead of reporting fragments', () => {
    expect(texts('const a = <p>Your key <strong>never</strong> leaves this device.</p>;'))
      .toEqual(['Your key never leaves this device.']);
    const wrapped = [
      'const a = (',
      '  <p>',
      '    Open the',
      '    <Link href="/guides">guides</Link> to learn more.',
      '  </p>',
      ');',
    ].join('\n');
    expect(texts(wrapped)).toEqual(['Open the guides to learn more.']);
  });

  it('reads text beside an expression, holding its place', () => {
    expect(texts('const a = <span>{count} new messages</span>;')).toEqual(['{…} new messages']);
    expect(texts('const a = <span>{a} / {b}</span>;')).toEqual([]);
  });

  it('reads text that starts with a digit, or runs past 120 characters', () => {
    expect(texts('const a = <p>2 members online</p>;')).toEqual(['2 members online']);
    const long = `Relays keep a copy of every message you send here, ${'and nothing else '.repeat(6)}at all.`;
    expect(texts(`const a = <p>${long}</p>;`)).toEqual([long]);
  });

  it('reads a URL inside JSX text, which comment stripping used to swallow', () => {
    expect(texts('const a = <p>Visit https://obelisk.ar today</p>;')).toEqual(['Visit https://obelisk.ar today']);
  });

  it('keeps block elements apart and scans a component inside a sentence on its own', () => {
    expect(texts('const a = <div><h2>Members</h2><p>No one here yet</p></div>;')).toEqual(['Members', 'No one here yet']);
    expect(texts('const a = <p>Press <Kbd>Enter</Kbd> to send</p>;').sort()).toEqual(['Enter', 'Press {…} to send']);
  });

  it('reads text inside an expression child', () => {
    expect(texts('const a = <div>{empty && (\n  <p>\n    Nothing to show\n    yet\n  </p>\n)}</div>;')).toEqual(['Nothing to show yet']);
  });

  it('reports a sentence once, not again for its inline parts or by the line regex', () => {
    expect(scan('const a = <p>Tap <b>Join</b> to enter the room</p>;')).toHaveLength(1);
  });
});

describe('i18n-exempt on multi-line JSX text', () => {
  it('applies a marker on any line of the run', () => {
    const before = "const a = (\n  <p>\n    {/* i18n-exempt: protocol term */}\n    Nostr Implementation\n    Possibilities\n  </p>\n);";
    const after = "const a = (\n  <p>\n    Nostr Implementation\n    Possibilities {/* i18n-exempt: protocol term */}\n  </p>\n);";
    expect(texts(before)).toEqual([]);
    expect(texts(after)).toEqual([]);
  });

  it("applies a marker on the parent's opening tag line", () => {
    expect(texts('const a = (\n  <code> {/* i18n-exempt: wire payload */}\n    Kind Nine Message\n  </code>\n);')).toEqual([]);
  });

  it('still requires a reason, and does not leak to a sibling paragraph', () => {
    expect(texts('const a = (\n  <p>\n    {/* i18n-exempt: */}\n    Plain English copy\n  </p>\n);')).toEqual(['Plain English copy']);
    const siblings = [
      'const a = (',
      '  <div>',
      '    <p>First paragraph text</p> {/* i18n-exempt: specimen */}',
      '    <p>Second paragraph</p>',
      '  </div>',
      ');',
    ].join('\n');
    expect(texts(siblings)).toEqual(['Second paragraph']);
  });
});
