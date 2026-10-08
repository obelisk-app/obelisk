import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The owner's rule: every dialog's header and footer look the same, because
 * they are the same components (docs/ui/conventions.md#modal-and-sheet-chrome).
 *
 *   desktop  `<Modal>` with `ModalHeader` and `ModalFooter` (src/components/ui/)
 *   phone    `<Sheet>` with `SheetHeader` and `SheetActions`
 *            (src/app/[locale]/app/mobile/sheets/)
 *
 * So a file that renders a dialog (`<Modal>`, `<Sheet>`, or `MediaLibraryShell`,
 * the media library's modal frame) may not draw its own chrome:
 *   - no `<h1>` / `<h2>` (the header renders the title; body sections use h3),
 *   - no `<header>` or `<footer>`,
 *   - no `CloseButton` (the header renders it),
 *   - none of the phone shell's title classes (`zap-title`, `confirm-sheet-*`,
 *     `sheet-identity*`, `sheet-subtitle`),
 * and it must render the shared header (`ModalHeader` / `SheetHeader`),
 * unless it is on the short reasoned list below.
 */

const ROOT = process.cwd();
const GUARDED = ['src/components', 'src/app'];

/**
 * Modules whose default export opens a dialog. The login steps' `Modal` from
 * `@nostr-wot/ui` is the SDK widget's own design, not one of these.
 */
const DIALOG_MODULE = /(?:\/ui\/overlays\/Modal|\/ui\/overlays\/Sheet|MediaLibraryShell)$/;
/** The shared pieces themselves, and the frames they sit in. */
const SHARED = new Set([
  'src/components/ui/overlays/Modal.tsx',
  'src/components/ui/overlays/Sheet.tsx',
  'src/components/ui/overlays/ModalHeader.tsx',
  'src/components/ui/overlays/ModalFooter.tsx',
  'src/app/[locale]/app/mobile/sheets/chrome/SheetHeader.tsx',
  'src/app/[locale]/app/mobile/sheets/chrome/SheetActions.tsx',
  'src/components/media/library/MediaLibraryShell.tsx',
]);
const BANNED_TAGS = new Set(['h1', 'h2', 'header', 'footer', 'CloseButton']);
const BANNED_CLASS = /\b(zap-title|confirm-sheet-(?:title|desc|icon)|sheet-identity[\w-]*|sheet-subtitle)\b/;

/**
 * Dialogs with no header, and why. Shrink-only: an entry that gains a header
 * fails until it is removed.
 */
const HEADERLESS: Readonly<Record<string, string>> = {
  'src/app/[locale]/app/mounts/lazy-mounts.tsx':
    'the loading placeholder shown for a split second while a game dialog downloads; the real dialog brings its header',
};

export interface ChromeReport {
  dialog: boolean;
  /** `tag` or `.class` drawn by hand, with its line. */
  handBuilt: string[];
  hasHeader: boolean;
}

function tagName(node: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string {
  return node.tagName.getText();
}

/** What a file draws of a dialog's chrome. */
export function chromeOf(source: string, fileName = 'x.tsx'): ChromeReport {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const report: ChromeReport = { dialog: false, handBuilt: [], hasHeader: false };
  const dialogTags = new Set<string>();
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && ts.isStringLiteral(stmt.moduleSpecifier) && DIALOG_MODULE.test(stmt.moduleSpecifier.text)) {
      const local = stmt.importClause?.name?.text;
      if (local) dialogTags.add(local);
    }
  }
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = tagName(node);
      if (dialogTags.has(name)) report.dialog = true;
      if (name === 'ModalHeader' || name === 'SheetHeader') report.hasHeader = true;
      if (BANNED_TAGS.has(name)) report.handBuilt.push(`<${name}> line ${line(node)}`);
    }
    if (ts.isJsxAttribute(node) && node.name.getText() === 'className' && node.initializer) {
      const match = node.initializer.getText().match(BANNED_CLASS);
      if (match) report.handBuilt.push(`.${match[1]} line ${line(node)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return report;
}

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

function dialogFiles(): Map<string, ChromeReport> {
  const out = new Map<string, ChromeReport>();
  for (const dir of GUARDED) {
    for (const path of tsxFiles(join(ROOT, dir))) {
      const file = relative(ROOT, path).split(sep).join('/');
      if (SHARED.has(file)) continue;
      const report = chromeOf(readFileSync(path, 'utf8'), file);
      if (report.dialog) out.set(file, report);
    }
  }
  return out;
}

describe('modal and sheet chrome', () => {
  const files = dialogFiles();

  it('is looking at the real dialogs', () => {
    expect(files.size).toBeGreaterThan(25);
  });

  it('draws no header, title, close button or footer by hand in a dialog file', () => {
    const offenders = [...files].filter(([, r]) => r.handBuilt.length > 0).map(([f, r]) => `${f}: ${r.handBuilt.join(', ')}`);
    expect(offenders, 'use ModalHeader / ModalFooter (desktop) or SheetHeader / SheetActions (phone)').toEqual([]);
  });

  it('gives every dialog the shared header, outside the reasoned list', () => {
    const missing = [...files].filter(([f, r]) => !r.hasHeader && !(f in HEADERLESS)).map(([f]) => f);
    expect(missing).toEqual([]);
  });

  it('keeps the headerless list short and every entry still headerless', () => {
    for (const [file, reason] of Object.entries(HEADERLESS)) {
      expect(files.get(file)?.hasHeader, file).toBe(false);
      expect(reason.length).toBeGreaterThan(30);
    }
    expect(Object.keys(HEADERLESS).length).toBeLessThanOrEqual(1);
  });
});

describe('the chrome rule', () => {
  it('bites on a hand-built header, close button, footer and sheet title', () => {
    const src = `import Modal from '@/components/ui/overlays/Modal';
    export default function X() {
      return <Modal onClose={f}>
        <header><h2>Title</h2><CloseButton onClick={f} /></header>
        <footer />
      </Modal>;
    }`;
    const r = chromeOf(src);
    expect(r.dialog).toBe(true);
    expect(r.hasHeader).toBe(false);
    expect(r.handBuilt.map((s) => s.split(' ')[0])).toEqual(['<header>', '<h2>', '<CloseButton>', '<footer>']);
    const sheet = chromeOf("import Sheet from '@/components/ui/overlays/Sheet';\nconst s = <Sheet><div className=\"zap-title\">T</div></Sheet>;");
    expect(sheet.handBuilt).toEqual(['.zap-title line 2']);
  });

  it('passes a dialog on the shared pieces, with h3 sections in its body', () => {
    const src = `import Modal from '@/components/ui/overlays/Modal';
    const m = <Modal onClose={f}>
      <ModalHeader title="t" onClose={f} />
      <section><h3>Part</h3></section>
      <ModalFooter actions={[]} />
    </Modal>;`;
    expect(chromeOf(src)).toEqual({ dialog: true, handBuilt: [], hasHeader: true });
  });

  it('ignores a file that renders no dialog, or another library\'s Modal', () => {
    expect(chromeOf('const p = <section><h2>Page</h2><footer /></section>;').dialog).toBe(false);
    expect(chromeOf("import { Modal } from '@nostr-wot/ui';\nconst p = <Modal><h2>Login</h2></Modal>;").dialog).toBe(false);
  });
});
