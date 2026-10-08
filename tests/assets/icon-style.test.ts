import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The owner's round 33 rule, "choose one style for the icons, and reuse it"
 * (docs/ui/conventions.md#icon-style), the sibling of `assets-only.test.ts`.
 * It fails when:
 *   1. two icons are names for one symbol: a variant suffix (`SearchShortIcon`,
 *      `UsersAltIcon`, `Copy2Icon`) or two names from one synonym group
 *      (`TrashIcon` and `BinIcon`, `EditIcon` and `PencilIcon`). A state with
 *      another meaning (`MicIcon` / `MicOffIcon`) is not a variant;
 *   2. an icon file leaves the style: its own `viewBox`, stroke width, caps or
 *      joins, a colour other than `currentColor`, a square-cornered `<rect>`.
 *      Filled glyphs (`fill="currentColor" stroke="none"`) are in the style;
 *      `STYLE_EXCEPTIONS` lists the reasoned rest, and only shrinks;
 *   3. a caller restyles an icon: caps, joins or a `viewBox` passed in, or a
 *      `strokeWidth` outside the weights `CALLER_WEIGHTS` allows.
 */

const ROOT = process.cwd();
const ASSETS = 'src/assets';
const ICONS = 'src/assets/icons';
const SHAPES = new Set(['svg', 'path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect', 'g']);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [relative(ROOT, path).split(sep).join('/')];
  });
}

const parse = (source: string, file: string) =>
  ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** Words that only say how a drawing differs, never what it means. */
const VARIANT_SUFFIX = /^(.+?)(Alt|Short|Wide|Large|Medium|Small|Narrow|Flat|Round|Rounded|Tall|Simple|Solid|Outline|Filled|Thin|Bold|Mini|Big|Capsule|Stand|Record|Pair|Vertical|Horizontal|Variant|New|Old|V?\d+)$/;
/** A second state with its own meaning (on / off) keeps its own icon. */
const STATE_SUFFIX = /(Off|Slash|Muted)$/;
/** Names that mean one symbol; two icons from one group are one icon. */
const SYNONYMS: readonly (readonly string[])[] = [
  ['Trash', 'Bin', 'Delete', 'Garbage'], ['Edit', 'Pencil', 'Pen'], ['Image', 'Photo', 'Picture', 'Gallery'],
  ['Heart', 'Love', 'Like'], ['Smile', 'Smiley', 'Emoji', 'Happy'], ['Gear', 'Settings', 'Cog', 'Sliders', 'Preferences'],
  ['Chat', 'Message', 'MessageCircle', 'MessageSquare', 'Comment', 'Bubble'], ['Send', 'PaperPlane'],
  ['Users', 'Members', 'People', 'Group'], ['User', 'Person', 'Account'], ['UserPlus', 'UserAdd', 'AddUser'],
  ['Maximize', 'Expand', 'Fullscreen', 'Enlarge'], ['Minimize', 'Shrink', 'FullscreenExit', 'Collapse'],
  ['Zap', 'Bolt', 'Lightning'], ['File', 'Document', 'Doc'], ['Video', 'VideoCamera'], ['Phone', 'Call'],
  ['More', 'Dots', 'Ellipsis', 'Kebab', 'Meatball'], ['Search', 'Find', 'Magnifier'], ['Reply', 'CornerUpLeft'],
  ['Share', 'ShareUp'], ['ScreenShare', 'Monitor'], ['Hash', 'Channels'], ['Sparkles', 'Sparkle'],
  ['Close', 'X', 'XMark', 'Cross'], ['ChevronDown', 'CaretDown'], ['Lock', 'Padlock'], ['Copy', 'Duplicate'],
  ['Star', 'Favorite'], ['Bell', 'Notification'],
];

/** Icon names that are a second name for a symbol another icon (or a variant word) already names. */
export function iconNameProblems(names: readonly string[]): string[] {
  const out: string[] = [];
  const owner = new Map<string, string>();
  for (const name of names) {
    const base = name.replace(/Icon$/, '');
    const variant = VARIANT_SUFFIX.exec(base);
    if (variant) out.push(`${name}: "${variant[2]}" names a variant of ${variant[1]}Icon, not a meaning`);
    const stem = base.replace(STATE_SUFFIX, '');
    const state = stem === base ? '' : ':off';
    const group = SYNONYMS.find((g) => g.includes(stem))?.[0] ?? stem;
    const key = `${group}${state}`;
    const first = owner.get(key);
    if (first) out.push(`${first} and ${name} name one symbol`);
    else owner.set(key, name);
  }
  return out;
}

/** Icons that may leave the style, and why. */
const STYLE_EXCEPTIONS: Readonly<Record<string, string>> = {
  'ObeliskReactIcon.tsx': 'the add-reaction button is the Obelisk mascot in brand colours, a mark drawn in fills, not a line icon',
};
const PAINT = new Set(['none', 'currentColor']);
const RESTYLE = new Set(['viewBox', 'strokeWidth', 'strokeLinecap', 'strokeLinejoin', 'strokeMiterlimit', 'strokeDasharray']);

const literalValues = (init: ts.JsxAttributeValue | undefined, sf: ts.SourceFile): string[] => {
  if (!init) return ['true'];
  if (ts.isStringLiteral(init)) return [init.text];
  const found: string[] = [];
  const visit = (n: ts.Node) => { if (ts.isStringLiteral(n) || ts.isNumericLiteral(n)) found.push(n.text); ts.forEachChild(n, visit); };
  visit(init);
  return found.length ? found : [init.getText(sf)];
};

/** Where an icon file leaves the icon style. */
export function iconStyleProblems(source: string, file: string, exceptions = STYLE_EXCEPTIONS): string[] {
  if (basename(file) in exceptions) return [];
  const sf = parse(source, file);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && (SHAPES.has(n.tagName.getText(sf)) || n.tagName.getText(sf) === 'IconSvg')) {
      const tag = n.tagName.getText(sf);
      const attrs = n.attributes.properties.filter(ts.isJsxAttribute);
      for (const a of attrs) {
        const name = a.name.getText(sf);
        if (RESTYLE.has(name)) out.push(`<${tag}> sets ${name}`);
        if ((name === 'fill' || name === 'stroke') && literalValues(a.initializer, sf).some((v) => !PAINT.has(v))) out.push(`<${tag}> paints ${name} other than currentColor`);
      }
      if (tag === 'rect' && !attrs.some((a) => a.name.getText(sf) === 'rx')) out.push('<rect> has square corners (no rx)');
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out.map((x) => `${basename(file)}: ${x}`);
}

/** Line weights a caller may pass to keep an icon legible at its size; 1.8 is the frame's own. */
const CALLER_WEIGHTS = new Set(['1.5', '2', '2.5', '3']);

/** Where a component restyles an icon it renders. */
export function callerStyleProblems(source: string, file: string): string[] {
  const sf = parse(source, file);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && /(^|\.)([A-Z]\w*)?Icon$/.test(n.tagName.getText(sf))) {
      const where = `${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} <${n.tagName.getText(sf)}>`;
      for (const a of n.attributes.properties.filter(ts.isJsxAttribute)) {
        const name = a.name.getText(sf);
        if (name === 'strokeWidth') {
          const values = literalValues(a.initializer, sf);
          if (values.some((v) => !CALLER_WEIGHTS.has(v))) out.push(`${where} strokeWidth ${values.join('/')}`);
        } else if (RESTYLE.has(name)) out.push(`${where} ${name}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('one icon style, one icon per symbol', () => {
  const all = files(join(ROOT, 'src'));
  const icons = all.filter((f) => f.startsWith(`${ICONS}/`) && f.endsWith('Icon.tsx'));

  it('names each symbol once', () => {
    expect(iconNameProblems(icons.map((f) => basename(f, '.tsx')))).toEqual([]);
  });

  it('draws every icon in the style, except the reasoned list', () => {
    expect(icons.flatMap((f) => iconStyleProblems(readFileSync(join(ROOT, f), 'utf8'), f))).toEqual([]);
    for (const [file, why] of Object.entries(STYLE_EXCEPTIONS)) {
      expect(why.length, file).toBeGreaterThan(30);
      expect(iconStyleProblems(readFileSync(join(ROOT, ICONS, file), 'utf8'), file, {}).length, `${file} is in the style now`).toBeGreaterThan(0);
    }
  });

  it('lets no caller restyle an icon beyond a line weight from the set', () => {
    const found = all
      .filter((f) => f.endsWith('.tsx') && !f.startsWith(`${ASSETS}/`))
      .flatMap((f) => callerStyleProblems(readFileSync(join(ROOT, f), 'utf8'), f));
    expect(found, 'docs/ui/conventions.md#icon-style').toEqual([]);
  });
});

describe('the icon style rule bites', () => {
  it('on a second name for one symbol: a variant suffix, a number, a synonym', () => {
    expect(iconNameProblems(['SearchIcon', 'SearchShortIcon'])).toEqual(['SearchShortIcon: "Short" names a variant of SearchIcon, not a meaning']);
    expect(iconNameProblems(['UsersAltIcon'])).toHaveLength(1);
    expect(iconNameProblems(['Copy2Icon'])).toHaveLength(1);
    expect(iconNameProblems(['TrashIcon', 'BinIcon'])).toEqual(['TrashIcon and BinIcon name one symbol']);
    expect(iconNameProblems(['VideoOffIcon', 'VideoCameraOffIcon'])).toEqual(['VideoOffIcon and VideoCameraOffIcon name one symbol']);
    expect(iconNameProblems(['MicIcon', 'MicOffIcon', 'BellIcon', 'BellOffIcon', 'CheckIcon', 'CheckCircleIcon', 'ShieldCheckIcon'])).toEqual([]);
  });

  it('on an icon file that leaves the style, and not on a filled glyph', () => {
    const own = (body: string, attrs = '') => `export default function XIcon(p) { return <IconSvg {...p}${attrs}>${body}</IconSvg>; }`;
    expect(iconStyleProblems(own('<path d="m6 9 6 6 6-6" />', ' viewBox="0 0 10 10"'), 'XIcon.tsx')).toEqual(['XIcon.tsx: <IconSvg> sets viewBox']);
    expect(iconStyleProblems(own('<path d="M2 4l3 3" strokeWidth="1.5" strokeLinecap="butt" />'), 'XIcon.tsx')).toHaveLength(2);
    expect(iconStyleProblems(own('<path d="M2 4" stroke="#b4f953" />'), 'XIcon.tsx')).toHaveLength(1);
    expect(iconStyleProblems(own('<rect x="3" y="3" width="18" height="18" />'), 'XIcon.tsx')).toEqual(['XIcon.tsx: <rect> has square corners (no rx)']);
    expect(iconStyleProblems(own('<path d="M8 5v14l11-7z" />', ' fill="currentColor" stroke="none"'), 'XIcon.tsx')).toEqual([]);
    expect(iconStyleProblems(own('<path d="M8 5" />', " fill={on ? 'currentColor' : 'none'}"), 'XIcon.tsx')).toEqual([]);
  });

  it('on a caller passing caps, joins, a grid or a weight outside the set', () => {
    const at = (jsx: string) => callerStyleProblems(`export const X = () => ${jsx};`, 'src/app/X.tsx');
    expect(at('<GearIcon strokeWidth={2} strokeLinejoin="miter" />')).toEqual(['src/app/X.tsx:1 <GearIcon> strokeLinejoin']);
    expect(at('<ChevronDownIcon strokeLinecap="butt" viewBox="0 0 10 10" />')).toHaveLength(2);
    expect(at('<SendIcon strokeWidth={2.2} />')).toEqual(['src/app/X.tsx:1 <SendIcon> strokeWidth 2.2']);
    expect(at('<item.Icon strokeWidth={1.75} />')).toHaveLength(1);
    expect(at('<CloseIcon size={12} strokeWidth={2.5} className="x" />')).toEqual([]);
    expect(at('<SearchIcon strokeWidth={wide ? 2 : 3} />')).toEqual([]);
  });
});
