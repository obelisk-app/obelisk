import { describe, expect, it } from 'vitest';
import { versionedPersist } from '@/store/persist-version';

interface Saved { readonly names: string[]; readonly count: number }
interface State extends Saved { readonly other: string }

const DEFAULTS: Saved = { names: [], count: 0 };
const sanitize = (raw: Record<string, unknown>): Saved => ({
  names: Array.isArray(raw.names) ? raw.names.filter((n): n is string => typeof n === 'string') : DEFAULTS.names,
  count: typeof raw.count === 'number' ? raw.count : DEFAULTS.count,
});

// v0 stored a single `name`; v1 turned it into `names`; v2 added `count`.
const opts = versionedPersist<State, Saved>({
  version: 2,
  upgrades: {
    0: (raw) => ({ names: typeof raw.name === 'string' ? [raw.name] : [] }),
    1: (raw) => ({ ...raw, count: Array.isArray(raw.names) ? raw.names.length : 0 }),
  },
  sanitize,
});
const migrate = (state: unknown, from: number) => opts.migrate(state, from);
const current: State = { names: ['live'], count: 9, other: 'kept' };

describe('versionedPersist', () => {
  it('runs every upgrade step from the saved version up to the current one, in order', () => {
    expect(migrate({ name: 'ada' }, 0)).toEqual({ names: ['ada'], count: 1 });
    expect(migrate({ names: ['a', 'b'] }, 1)).toEqual({ names: ['a', 'b'], count: 2 });
  });

  it('a version from a newer build, or a nonsense version, yields the defaults', () => {
    for (const v of [3, 99, -1, 0.5, Number.NaN]) expect(migrate({ names: ['x'], count: 1 }, v)).toEqual(DEFAULTS);
  });

  it('merge layers only sanitized saved fields over the current state', () => {
    expect(opts.merge({ names: ['a', 3], count: 'many', other: 'from disk', extra: true }, current))
      .toEqual({ names: ['a'], count: 0, other: 'kept' });
  });

  it('never throws, whatever storage hands it', () => {
    const inputs: unknown[] = [undefined, null, 'x', 42, true, [], [1], { name: 7 }, { names: 'a' }, () => 1];
    for (const input of inputs) {
      for (const from of [0, 1, 2, 5]) expect(() => opts.merge(migrate(input, from), current)).not.toThrow();
      expect(opts.merge(input, current).other).toBe('kept');
    }
  });
});
