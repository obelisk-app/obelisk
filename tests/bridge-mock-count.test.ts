/**
 * Tests that replace the whole bridge module only shrink in number.
 *
 * `vi.mock('@/services/nostr-bridge', ...)` swaps every hook for a closure
 * (`bridgeMock` in `tests/support/mocks/nostr-bridge.ts`), so the component
 * under test never runs the real `useGroups`, `useMyFollows` or
 * `useSubscription`: a hook whose subscription wiring is wrong still passes.
 * The replacement is a fake instance under the real provider
 * (`tests/support/fake-bridge.ts` with `render-with-bridge.tsx`). New tests
 * use that; old ones convert when their component is next touched.
 *
 * This counts the test files that still mock the module and fails when the
 * count rises. When it falls, lower BUDGET to the new count in the same
 * commit (the second check says so), so the room a conversion freed cannot
 * be spent on a new mock.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Files mocking `@/services/nostr-bridge`: 111 on 2026-10-06 (round 17);
 * 98 after round 20 converted the thirteen suites of the components and
 * hooks that moved to `useBridge()` (the voice room's four, the follow
 * buttons, the profile, the member lists, the deep link, presence, the
 * slash catalog); 97 after round 21 moved the invoice card's suite to
 * `fakeBridge`; 96 after round 23 deleted the phone's mock zap sheet and
 * its suite.
 */
const BUDGET = 96;

const TESTS = join(process.cwd(), 'tests');
/** The front door itself, not a path inside it (`/client` and friends are counted elsewhere, if at all). */
const MODULE_MOCK = /vi\.mock\(\s*['"]@\/services\/nostr-bridge['"]/;

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return testFiles(path);
    return /\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** This file, whose own examples below would otherwise count. */
const SELF = join(TESTS, 'bridge-mock-count.test.ts');

export function mockingFiles(): string[] {
  return testFiles(TESTS)
    .filter((path) => path !== SELF)
    .filter((path) => MODULE_MOCK.test(readFileSync(path, 'utf8')))
    .map((path) => relative(process.cwd(), path).split(sep).join('/'))
    .sort();
}

describe('whole-module mocks of the bridge', () => {
  const files = mockingFiles();

  it('is looking at real tests (the pattern still matches the mocks that exist)', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(MODULE_MOCK.test("vi.mock('@/services/nostr-bridge', async () => ({}))")).toBe(true);
    expect(MODULE_MOCK.test("vi.mock('@/services/nostr-bridge/client', () => ({}))")).toBe(false);
  });

  it(`do not grow past ${BUDGET}: write a new test with fakeBridge and renderWithBridge instead`, () => {
    expect(files.length).toBeLessThanOrEqual(BUDGET);
  });

  it('have their budget lowered when one is converted', () => {
    expect(BUDGET, `only ${files.length} files mock the bridge now: set BUDGET to ${files.length}`).toBe(files.length);
  });
});
