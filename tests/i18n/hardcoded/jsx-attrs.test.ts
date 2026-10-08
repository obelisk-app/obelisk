import { describe, expect, it } from 'vitest';
import { scanFile } from '../../../scripts/i18n/hardcoded-strings';

/**
 * String props of custom components. The scanner used to read only six
 * attribute names (`title`, `label`, `placeholder`, `alt`, `aria-label`,
 * `aria-description`), so `<SettingRow subtitle="Shown to everyone" />`
 * passed with a baseline of zero. Every "flagged" case here passed the
 * old scanner with nothing reported.
 */
const scan = (source: string) => scanFile('components/x/Foo.tsx', source);
const texts = (source: string) => scan(source).map((f) => f.text);

describe('string props of any JSX attribute', () => {
  it('reads a quoted prop of a custom component', () => {
    expect(texts('const a = <SettingRow subtitle="Shown to everyone" />;')).toEqual(['Shown to everyone']);
    expect(texts('const a = <Empty emptyText="Nothing here yet" />;')).toEqual(['Nothing here yet']);
    expect(texts('const a = <Confirm confirmLabel="Delete" />;')).toEqual(['Delete']);
  });

  it("reads a string in braces, {'...'} and a template with no substitutions", () => {
    expect(texts("const a = <Card heading={'Recent activity'} />;")).toEqual(['Recent activity']);
    expect(texts('const a = <Card heading={`Recent activity`} />;')).toEqual(['Recent activity']);
    expect(texts("const a = <Card heading={('Recent activity')} />;")).toEqual(['Recent activity']);
  });

  it('reads reader-facing attributes of plain elements beyond the old six', () => {
    expect(texts('const a = <div aria-roledescription="Draggable card" />;')).toEqual(['Draggable card']);
  });

  it('reports the line the text is on, in a multi-line element', () => {
    const source = [
      'const a = (',
      '  <SettingRow',
      '    icon={<Bell />}',
      '    description="Sends a ping when someone mentions you"',
      '  />',
      ');',
    ].join('\n');
    expect(scan(source).map((f) => [f.line, f.text, f.rule])).toEqual([
      [4, 'Sends a ping when someone mentions you', 'jsxAttr'],
    ]);
  });

  it('leaves tokens, expressions and t() calls alone', () => {
    expect(texts('const a = <Row mode="compact" align="start" />;')).toEqual([]);
    expect(texts("const a = <Row subtitle={t('settings.row.subtitle')} hint={user.name} />;")).toEqual([]);
  });

  it('reports a string once when the old attribute rule also sees it', () => {
    expect(scan('const a = <b title="Remove relay" />;')).toHaveLength(1);
    expect(scan("const a = <b title={'Remove relay'} />;")).toHaveLength(1);
  });
});

/** The documented skip list (docs/architecture/i18n.md, The ratchet), written out so dropping a name fails here. */
const NOT_READER_FACING = [
  'className', 'class', 'style', 'id', 'key', 'testId',
  'href', 'src', 'srcSet', 'allow',
  'type', 'name', 'role', 'rel', 'target', 'method', 'as', 'htmlFor', 'autoComplete', 'inputMode', 'lang', 'dir',
  'variant', 'size', 'tone',
  'd', 'path', 'transform', 'preserveAspectRatio',
];

describe('attributes that are not reader-facing', () => {
  it.each(NOT_READER_FACING)('skips %s', (name) => {
    expect(texts(`const a = <Foo ${name}="Shown to everyone" />;`)).toEqual([]);
  });

  it('skips data-*, data-testid and event handlers', () => {
    expect(texts('const a = <div data-emoji-category="Recent" data-testid="Send Button" />;')).toEqual([]);
    expect(texts("const a = <Foo onConfirm={'Do It Now'} onClick=\"Go Home\" />;")).toEqual([]);
  });

  it('skips the shapes that read like prose but are not: classes, rel lists, SVG path data', () => {
    expect(texts('const a = <div className="screen active" />;')).toEqual([]);
    expect(texts('const a = <a rel="noopener noreferrer" />;')).toEqual([]);
    expect(texts('const a = <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />;')).toEqual([]);
  });
});

describe('i18n-exempt on string props', () => {
  it('honours a marker on the line of the prop', () => {
    expect(texts('const a = <SectionHeader hint="NIP-29 kind 9000 / 9001" />; {/* i18n-exempt: protocol term */}')).toEqual([]);
    const ownLine = [
      'const a = (',
      '  <SectionHeader',
      '    hint="NIP-29 kind 9000 / 9001" // i18n-exempt: protocol term',
      '  />',
      ');',
    ].join('\n');
    expect(texts(ownLine)).toEqual([]);
  });

  it('still requires a reason, and does not leak to a sibling prop', () => {
    expect(texts('const a = <Row hint="Shown to everyone" />; {/* i18n-exempt: */}')).toEqual(['Shown to everyone']);
    const siblings = [
      'const a = (',
      '  <Row',
      '    hint="NIP-29 kind 9000" // i18n-exempt: protocol term',
      '    subtitle="Shown to everyone"',
      '  />',
      ');',
    ].join('\n');
    expect(texts(siblings)).toEqual(['Shown to everyone']);
  });
});
