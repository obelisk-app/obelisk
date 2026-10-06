/**
 * Regenerate `src/i18n/hardcoded-baseline.json` from the scanner, or list
 * what it finds.
 *
 *   npx tsx scripts/i18n/hardcoded-baseline.ts           # rewrite the baseline
 *   npx tsx scripts/i18n/hardcoded-baseline.ts --list    # every finding, file:line [rule] text
 *   npx tsx scripts/i18n/hardcoded-baseline.ts --list components/chat   # one folder
 *
 * The baseline only ever shrinks (tests/i18n/hardcoded-strings.test.ts):
 * after moving strings to the messages, rerun this and commit the smaller
 * file. Never hand-merge it; regenerate.
 */

import { writeFileSync } from 'node:fs';
import { countsByFile, scanTree } from '../../src/i18n/hardcoded-strings';

const args = process.argv.slice(2);
const tree = scanTree('src');
const findings = Object.values(tree).flat();

if (args[0] === '--list') {
  const prefix = args[1] ?? '';
  for (const f of findings.filter((x) => x.file.startsWith(prefix))) console.log(`${f.file}:${f.line} [${f.rule}] ${f.text}`);
} else {
  writeFileSync('src/i18n/hardcoded-baseline.json', `${JSON.stringify(countsByFile(tree), null, 2)}\n`);
}

const byRule: Record<string, number> = {};
for (const f of findings) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1;
console.error(`${findings.length} strings in ${Object.keys(tree).length} files`, byRule);
