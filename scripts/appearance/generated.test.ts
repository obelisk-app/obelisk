// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('ships a bootstrap generated from the current shared appearance code', () => {
  expect(() => execFileSync(process.execPath, ['--import', 'tsx', 'scripts/appearance/generate.ts', '--check'])).not.toThrow();
});
