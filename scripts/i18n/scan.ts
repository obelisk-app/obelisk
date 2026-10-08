/** Read-only diagnostics: npx tsx scripts/i18n/scan.ts [src-relative folder]. */
import { scanTree } from './hardcoded-strings';

const prefix = process.argv[2] ?? '';
const findings = Object.values(scanTree('src')).flat().filter((finding) => finding.file.startsWith(prefix));
for (const finding of findings) console.log(`${finding.file}:${finding.line} [${finding.rule}] ${finding.text}`);
console.error(`${findings.length} untranslated strings`);
process.exitCode = findings.length ? 1 : 0;
