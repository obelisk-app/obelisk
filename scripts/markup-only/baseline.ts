/**
 * Regenerate the markup-only baseline, or list what the guard finds.
 *
 *   npx tsx scripts/markup-only/baseline.ts                 # rewrite the baseline
 *   npx tsx scripts/markup-only/baseline.ts --list          # every finding, file:line [kind] what
 *   npx tsx scripts/markup-only/baseline.ts --list src/components/voice   # one folder
 *   npx tsx scripts/markup-only/baseline.ts --top 20        # the files with the most findings
 *
 * The baseline only ever shrinks (tests/components/markup-only.test.ts):
 * after moving logic out of a component, rerun this and commit the smaller
 * file. Never hand-edit it.
 */

import { writeFileSync } from 'node:fs';
import { total } from './analyze';
import { BASELINE_PATH, countsByFile, scanTree } from './scan';

const args = process.argv.slice(2);
const tree = scanTree();

if (args[0] === '--list') {
  const prefix = args[1] ?? '';
  for (const [file, entry] of Object.entries(tree)) {
    if (!file.startsWith(prefix)) continue;
    for (const f of entry.findings) console.log(`${file}:${f.line} [${f.kind}] ${f.what}`);
  }
} else if (args[0] === '--top') {
  const n = Number(args[1] ?? 20);
  const ranked = Object.entries(tree).sort((a, b) => total(b[1].counts) - total(a[1].counts)).slice(0, n);
  for (const [file, entry] of ranked) console.log(`${total(entry.counts)}\t${file}\t${JSON.stringify(entry.counts)}`);
} else {
  writeFileSync(BASELINE_PATH, `${JSON.stringify(countsByFile(tree), null, 2)}\n`);
}

const byKind: Record<string, number> = {};
let sum = 0;
for (const entry of Object.values(tree)) {
  for (const f of entry.findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
  sum += entry.findings.length;
}
console.error(`${sum} findings in ${Object.keys(tree).length} files`, byKind);
