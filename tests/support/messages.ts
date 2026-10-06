import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MODULES, type Module } from '@/i18n/modules';
import { LOCALES, type Locale } from '@/i18n';

const DIR = resolve(__dirname, '..', '..', 'src', 'i18n', 'messages');

export type MessageTree = { [key: string]: string | MessageTree };

/** One module of one locale, straight from disk. */
export function readModule(locale: Locale, module: Module): MessageTree {
  return JSON.parse(readFileSync(join(DIR, locale, `${module}.json`), 'utf8')) as MessageTree;
}

const cache = new Map<Locale, Record<Module, MessageTree>>();

/** Every module of a locale, keyed by module name: what the server loads. */
export function allMessages(locale: Locale): Record<Module, MessageTree> {
  let hit = cache.get(locale);
  if (!hit) {
    hit = Object.fromEntries(MODULES.map((m) => [m, readModule(locale, m)])) as Record<Module, MessageTree>;
    cache.set(locale, hit);
  }
  return hit;
}

/** `{ 'chat.composer.send': 'Send', ... }` for one locale. */
export function flatMessages(locale: Locale): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (node: MessageTree, path: string) => {
    for (const [k, v] of Object.entries(node)) {
      const p = path ? `${path}.${k}` : k;
      if (typeof v === 'string') out[p] = v;
      else walk(v, p);
    }
  };
  walk(allMessages(locale) as unknown as MessageTree, '');
  return out;
}

export { LOCALES, MODULES };
