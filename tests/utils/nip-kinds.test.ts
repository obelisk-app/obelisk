/**
 * Guards the rule in `nip-kinds.ts`: it is the single source of truth for
 * event kinds. A local `const KIND_X = 123` anywhere else is a second copy
 * that can drift (the bridge carried 21 of them for a year, four names for
 * kind 9 across the tree), and a raw `kinds: [10002]` in a filter is a kind
 * nobody can grep for by name.
 *
 * `KNOWN_LOCAL_KIND_FILES` is the debt that existed when this test was
 * written. Each entry must still contain an offender, so fixing a file
 * forces its removal from the list and the list only ever shrinks.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(process.cwd(), 'src');
const SOURCE_OF_TRUTH = 'src/utils/nip-kinds.ts';

const KNOWN_LOCAL_KIND_FILES = new Set([
  'src/services/social/interests.ts',
  'src/services/social/kinds.ts',
  'src/services/social/profiles.ts',
  'src/services/social/publish.ts',
  'src/services/social/starter-packs.ts',
]);

const KNOWN_RAW_KIND_FILTER_FILES = new Set([
  'src/hooks/chat/useMessageZaps.ts',
  'src/hooks/useNostrUserSearch.ts',
  'src/services/server/nostr-fetch.ts',
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
    out.push(relative(process.cwd(), full));
  }
  return out;
}

const LOCAL_KIND_CONST = /^\s*(?:export\s+)?const\s+KIND_\w+\s*=\s*\d+/m;
const RAW_KIND_FILTER = /kinds:\s*\[\s*\d/;

/** Doc comments quote filters as prose (`{kinds:[39000]}`); only code counts. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function code(file: string): string {
  return stripComments(readFileSync(file, 'utf8'));
}

describe('nip-kinds is the single source of truth', () => {
  const files = sourceFiles(SRC);

  it('declares every kind the bridge uses', () => {
    const text = readFileSync(SOURCE_OF_TRUTH, 'utf8');
    for (const name of [
      'KIND_GROUP_CHAT_MESSAGE',
      'KIND_GROUP_PUT_USER',
      'KIND_GROUP_REMOVE_USER',
      'KIND_GROUP_EDIT_METADATA',
      'KIND_GROUP_REMOVE_PERMISSION',
      'KIND_GROUP_DELETE_EVENT',
      'KIND_GROUP_JOIN_REQUEST',
      'KIND_GROUP_LEAVE_REQUEST',
      'KIND_MUTE_LIST',
      'KIND_CLIENT_AUTH',
      'KIND_CONTACT_LIST',
      'KIND_EVENT_DELETION',
      'KIND_REACTION',
    ]) {
      expect(text, `${name} missing from ${SOURCE_OF_TRUTH}`).toMatch(new RegExp(`export const ${name} = \\d+;`));
    }
  });

  it('has no local KIND_ constant outside the known debt', () => {
    const offenders = files.filter(
      (f) => f !== SOURCE_OF_TRUTH && !KNOWN_LOCAL_KIND_FILES.has(f) && LOCAL_KIND_CONST.test(code(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('has no raw numeric kinds filter outside the known debt', () => {
    const offenders = files.filter(
      (f) => !KNOWN_RAW_KIND_FILTER_FILES.has(f) && RAW_KIND_FILTER.test(code(f)),
    );
    expect(offenders).toEqual([]);
  });

  it('keeps the debt lists honest: every listed file still offends', () => {
    for (const f of KNOWN_LOCAL_KIND_FILES) {
      expect(LOCAL_KIND_CONST.test(code(f)), `${f} is fixed; remove it from KNOWN_LOCAL_KIND_FILES`).toBe(true);
    }
    for (const f of KNOWN_RAW_KIND_FILTER_FILES) {
      expect(RAW_KIND_FILTER.test(code(f)), `${f} is fixed; remove it from KNOWN_RAW_KIND_FILTER_FILES`).toBe(true);
    }
  });
});
