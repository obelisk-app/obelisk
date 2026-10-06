/**
 * Author-list batching for one-shot reads (design §4.4): the one place the
 * hub ever combines two callers' filters, and the correct answer to the
 * SDK's `QueryBatcher._mergeFilters`, which turns
 * `{kinds:[0], authors:[a], limit:5}` and `{kinds:[0], authors:[b], limit:5}`
 * into `{kinds:[0], authors:[a,b]}` with no `limit` at all. That is wrong
 * twice: the bound disappears (unbounded on a chatty author), and even
 * keeping `limit: 5` would be wrong because a relay applies `limit` to the
 * whole filter's result, so one author with six revisions starves the other.
 *
 * Rules, and no others:
 *  1. Only filters of the exact shape `{kinds, authors, limit?}` with the
 *     same `kinds` are candidates. Anything carrying `since`, `until`,
 *     `search`, `ids` or a `#tag` goes on the wire verbatim as its own
 *     filter (still one REQ, N filters, no semantic change).
 *  2. Merged `authors` is the deduped union, chunked at `authorsPerChunk`
 *     (100: relays reject very large filters; obelisk's `KIND0_BATCH_SIZE`).
 *  3. Merged `limit` is `sum(limit_i)`, capped at `maxMergedLimit` (500) by
 *     splitting the chunk, never by lowering anyone's share. Candidates
 *     without a `limit` are merged among themselves and carry no `limit`,
 *     so one caller's missing bound never removes another caller's.
 *  4. Results are demultiplexed with nostr-tools `matchFilter(original, ev)`
 *     so a caller sees only its own authors. `limit` is the one thing demux
 *     cannot enforce exactly; the sum rule makes each caller's share "at
 *     least `limit_i` if the relay has them", which is the most a merged
 *     REQ can promise, and a caller may receive more than it asked for.
 *  5. Time windows are never merged: two `since` values would need
 *     `min(since)` and over-fetch for one caller.
 *
 * Live subscriptions never come through here; the registry dedupes
 * identical REQs and otherwise keeps every caller's filter separate.
 */
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { matchFilter } from 'nostr-tools/filter';
import { canonicalFilter } from './canonical';
import type { QueryResult, QuerySpec, RelayHub } from './types';

export interface BatchOptions {
  /** Default 100. */
  readonly authorsPerChunk: number;
  /** Default 500. */
  readonly maxMergedLimit: number;
}

export const DEFAULT_BATCH_OPTIONS: BatchOptions = { authorsPerChunk: 100, maxMergedLimit: 500 };

export interface BatchPlan {
  /** What goes on the wire, in one REQ: merged chunks first, then every non-candidate verbatim. */
  readonly filters: readonly Filter[];
  /** For each input filter, the index in `filters` that carries it. */
  readonly placement: readonly number[];
  /** How many input filters were folded into a shared chunk. */
  readonly merged: number;
}

export interface BatchedQueryResult {
  readonly result: QueryResult;
  /** `perFilter[i]` holds the events matching `spec.filters[i]`, in wire order. */
  readonly perFilter: readonly (readonly NostrEvent[])[];
  readonly plan: BatchPlan;
}

interface Candidate {
  readonly index: number;
  readonly kinds: number[];
  readonly authors: string[];
  readonly limit: number | undefined;
}

interface Chunk {
  readonly kinds: number[];
  readonly authors: Set<string>;
  limit: number | undefined;
  readonly members: number[];
}

const CANDIDATE_KEYS = new Set(['kinds', 'authors', 'limit']);

function asCandidate(filter: Filter, index: number, opts: BatchOptions): Candidate | null {
  const source = filter as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (source[key] === undefined) continue;
    if (!CANDIDATE_KEYS.has(key)) return null;
  }
  const kinds = filter.kinds;
  const authors = filter.authors;
  if (!Array.isArray(kinds) || kinds.length === 0) return null;
  if (!Array.isArray(authors) || authors.length === 0) return null;
  const uniqueAuthors = Array.from(new Set(authors.map((a) => a.toLowerCase())));
  // A single caller already over the chunk size is not made smaller here; it goes verbatim.
  if (uniqueAuthors.length > opts.authorsPerChunk) return null;
  const limit = filter.limit;
  if (limit !== undefined && !(Number.isInteger(limit) && limit > 0)) return null;
  return { index, kinds: Array.from(new Set(kinds)).sort((a, b) => a - b), authors: uniqueAuthors, limit };
}

function groupKey(c: Candidate): string {
  return canonicalFilter({ kinds: c.kinds }) + (c.limit === undefined ? '|unbounded' : '|bounded');
}

export function planAuthorBatches(filters: readonly Filter[], opts: Partial<BatchOptions> = {}): BatchPlan {
  const o: BatchOptions = { ...DEFAULT_BATCH_OPTIONS, ...opts };
  const groups = new Map<string, Chunk[]>();
  const passthrough: number[] = [];
  let merged = 0;

  filters.forEach((filter, index) => {
    const c = asCandidate(filter, index, o);
    if (!c) {
      passthrough.push(index);
      return;
    }
    const key = groupKey(c);
    const chunks = groups.get(key) ?? [];
    groups.set(key, chunks);
    // First chunk with room; an author already present in a chunk costs it nothing.
    const open = chunks.find((chunk) => fits(chunk, c, o));
    if (open) {
      for (const a of c.authors) open.authors.add(a);
      if (open.limit !== undefined && c.limit !== undefined) open.limit += c.limit;
      open.members.push(index);
      merged += open.members.length === 2 ? 2 : 1;
      return;
    }
    chunks.push({ kinds: c.kinds, authors: new Set(c.authors), limit: c.limit, members: [index] });
  });

  const wire: Filter[] = [];
  const placement: number[] = new Array<number>(filters.length).fill(-1);
  for (const chunks of groups.values()) {
    for (const chunk of chunks) {
      const filter: Filter = { kinds: chunk.kinds, authors: Array.from(chunk.authors).sort() };
      if (chunk.limit !== undefined) filter.limit = chunk.limit;
      const at = wire.push(filter) - 1;
      for (const member of chunk.members) placement[member] = at;
    }
  }
  for (const index of passthrough) placement[index] = wire.push({ ...filters[index] }) - 1;
  return { filters: wire, placement, merged };
}

function fits(chunk: Chunk, c: Candidate, o: BatchOptions): boolean {
  let added = 0;
  for (const a of c.authors) if (!chunk.authors.has(a)) added += 1;
  if (chunk.authors.size + added > o.authorsPerChunk) return false;
  if (chunk.limit !== undefined && c.limit !== undefined && chunk.limit + c.limit > o.maxMergedLimit) return false;
  return true;
}

/** Route each event to every original filter it matches. An event can appear under several callers. */
export function demuxByFilter(events: readonly NostrEvent[], filters: readonly Filter[]): NostrEvent[][] {
  return filters.map((filter) => events.filter((ev) => matchFilter(filter, ev)));
}

/**
 * One `hub.query` carrying the planned filters, demultiplexed back to the
 * caller's filters. Caching and in-flight dedupe apply to the merged spec,
 * so two batched calls with the same inputs share one REQ and one result.
 */
export async function queryAuthorsBatched(
  hub: Pick<RelayHub, 'query'>,
  spec: QuerySpec,
  opts: Partial<BatchOptions> = {},
): Promise<BatchedQueryResult> {
  const plan = planAuthorBatches(spec.filters, opts);
  const result = await hub.query({ ...spec, filters: plan.filters });
  return { result, perFilter: demuxByFilter(result.events, spec.filters), plan };
}
