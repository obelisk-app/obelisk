/**
 * Versioned persistence for the stores in this folder.
 *
 * Every saved blob carries the `version` it was written with. When the app
 * loads a blob from an older version, `migrate` runs the store's upgrade
 * steps one version at a time. Whatever comes out of storage, upgraded or
 * not, then passes through the store's `sanitize` inside `merge`, which keeps
 * only fields of the right type and takes the rest from the store's defaults.
 *
 * So a returning user's saved data is carried forward, and corrupt data, a
 * blob from a newer build, or a value of the wrong type falls back to the
 * defaults instead of reaching memory. Nothing here throws: a throw inside
 * zustand's hydrate leaves the store unhydrated with whatever was in memory.
 *
 * Unparseable JSON never reaches this code (zustand's JSON storage throws
 * first); `createEnsureForAccount` handles that case for the per-account
 * stores, and the others simply keep their initial state.
 */
import type { PersistOptions } from 'zustand/middleware';

type Raw = Record<string, unknown>;

/** One upgrade step: the raw state saved under version `n`, rewritten into version `n + 1`. */
export type Upgrade = (raw: Raw) => Raw;

export interface VersionSpec<P> {
  /** The version this build writes. Bump it whenever the saved shape changes. */
  readonly version: number;
  /** `upgrades[n]` turns a version-`n` blob into version `n + 1`. A missing step means "unchanged". */
  readonly upgrades?: Readonly<Record<number, Upgrade>>;
  /** Keep what is valid, default the rest. Must accept anything and never throw. */
  readonly sanitize: (raw: Raw) => P;
}

/** The `version`, `migrate` and `merge` options for a `persist` config. */
export function versionedPersist<S, P>(
  spec: VersionSpec<P>,
): Required<Pick<PersistOptions<S, P>, 'version' | 'migrate' | 'merge'>> {
  return {
    version: spec.version,
    migrate: (persisted, from) => {
      // A blob from a newer build (a downgrade) or with a nonsense version
      // means a shape this code does not know; read none of it.
      if (!Number.isInteger(from) || from < 0 || from > spec.version) return spec.sanitize({});
      let raw = asRecord(persisted);
      for (let v = from; v < spec.version; v++) {
        const step = spec.upgrades?.[v];
        if (step) raw = asRecord(step(raw));
      }
      return spec.sanitize(raw);
    },
    merge: (persisted, current) => ({ ...current, ...spec.sanitize(asRecord(persisted)) }),
  };
}

// -- field guards: each takes an unknown value and returns a valid one ----

export function asRecord(value: unknown): Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Raw) : {};
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** A `Record<string, T>` keeping only the entries `pick` accepts (it returns `undefined` to drop one). */
export function recordOf<T>(value: unknown, pick: (entry: unknown) => T | undefined): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, entry] of Object.entries(asRecord(value))) {
    const kept = pick(entry);
    if (kept !== undefined) out[key] = kept;
  }
  return out;
}

/** An array keeping only the items `pick` accepts. */
export function arrayOf<T>(value: unknown, pick: (item: unknown) => T | undefined): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value) {
    const kept = pick(item);
    if (kept !== undefined) out.push(kept);
  }
  return out;
}

/** `value` if it is one of `allowed`, otherwise `undefined`. */
export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function finiteOrUndefined(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}
