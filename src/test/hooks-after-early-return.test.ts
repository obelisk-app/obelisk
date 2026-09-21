import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A component that returns early and *then* calls a hook renders a different
 * number of hooks depending on which branch it took. React refuses that
 * (error #310) by blowing up the nearest error boundary — which, for the
 * chat shell, means the whole surface goes to "Algo se rompió en esta
 * pantalla" the moment the condition flips.
 *
 * It happened for real: `useHistoryDismiss` sat below `if (!isLoggedIn)` in
 * `DesktopShell`, so logging in — not loading, not navigating, the one
 * transition every session makes — broke the app.
 *
 * jsdom tests don't reliably catch it, because a test usually renders the
 * component in one branch only. This reads the source instead.
 */

const HOOK = /^\s{2,6}(?:const\s+[\w{},:\s[\]]+=\s*)?use[A-Z]\w*\s*\(/;
const COMPONENT_START = /^(?:export\s+)?(?:export\s+default\s+)?function\s/;

/** Find hook calls that a `return` inside an `if` block can skip. */
export function hooksAfterEarlyReturn(source: string): string[] {
  const lines = source.split('\n');
  const problems: string[] = [];
  let earlyReturnLine: number | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // A new top-level function is a new hook scope.
    if (COMPONENT_START.test(line)) {
      earlyReturnLine = null;
      continue;
    }

    // `if (…) return …` on one line, or an `if` block containing a return.
    if (/^ {2}if\s*\(/.test(line)) {
      if (/\breturn\b/.test(line)) {
        earlyReturnLine = i;
      } else if (line.trimEnd().endsWith('{')) {
        for (let j = i + 1; j < lines.length; j += 1) {
          if (/^ {2}\}/.test(lines[j])) break;
          if (/^\s+return\b/.test(lines[j])) { earlyReturnLine = i; break; }
        }
      }
      continue;
    }

    if (earlyReturnLine !== null && HOOK.test(line)) {
      problems.push(`line ${i + 1}: ${line.trim()} (reachable only past the early return on line ${earlyReturnLine + 1})`);
      earlyReturnLine = null;
    }
  }

  return problems;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
    } else if (entry.endsWith('.tsx') && !entry.includes('.test.')) {
      out.push(path);
    }
  }
  return out;
}

describe('hooks after an early return', () => {
  it('detects the shape that broke the desktop shell', () => {
    // The actual pre-fix code, kept as the detector's fixture.
    const broken = [
      'export default function AppShell() {',
      '  const [open, setOpen] = useState(false);',
      '  if (!isLoggedIn) {',
      '    return <LoginModal />;',
      '  }',
      '  const dismiss = useHistoryDismiss(open, close);',
      '  return <div />;',
      '}',
    ].join('\n');
    expect(hooksAfterEarlyReturn(broken)).toHaveLength(1);
  });

  it('accepts a hook above the early return', () => {
    const fine = [
      'export default function AppShell() {',
      '  const dismiss = useHistoryDismiss(open, close);',
      '  if (!isLoggedIn) return <LoginModal />;',
      '  return <div />;',
      '}',
    ].join('\n');
    expect(hooksAfterEarlyReturn(fine)).toEqual([]);
  });

  it('finds none in src', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      for (const problem of hooksAfterEarlyReturn(readFileSync(file, 'utf8'))) {
        offenders.push(`${file}:${problem}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
