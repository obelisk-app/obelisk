import type { JsGroup, JsSearchHit } from '@/services/nostr-bridge';
import type { ParsedQuery } from '@/utils/chat/search/search-query';

export interface RelaySearchOptions {
  /** The open channel, for the "this channel only" scope. `null` disables the scope. */
  readonly activeGroupId?: string | null;
}

export interface RelaySearch {
  readonly raw: string;
  readonly setRaw: (raw: string) => void;
  readonly parsed: ParsedQuery;
  /** The free-text terms joined, for the people and channel sections. */
  readonly entityQuery: string;
  /** True while the query is a structured token search, when the entity sections are noise. */
  readonly hasStructuredTokens: boolean;
  readonly groups: ReadonlyArray<JsGroup>;
  readonly groupById: ReadonlyMap<string, JsGroup>;
  /** Channels matching the free text, or every channel when there is none. */
  readonly channelMatches: ReadonlyArray<JsGroup>;

  readonly results: ReadonlyArray<JsSearchHit>;
  readonly busy: boolean;
  readonly error: string | null;
  readonly partial: boolean;
  readonly relayFiltered: boolean;
  readonly relaySearchable: boolean;
  readonly loadingMore: boolean;
  /** Fetch the page before the oldest hit; `null` when there is nothing older to ask for. */
  readonly loadMore: (() => void) | null;
  /** Run the current query now, bypassing the debounce, and record it in history. */
  readonly submit: () => void;

  readonly thisChannelOnly: boolean;
  readonly canScopeToChannel: boolean;
  readonly toggleScope: () => void;

  readonly activeIndex: number;
  readonly setActiveIndex: (index: number) => void;
  /** Keyboard navigation over the hits; wraps at both ends. */
  readonly moveActive: (delta: 1 | -1) => void;

  readonly history: ReadonlyArray<string>;
  readonly clearHistory: () => void;
  /** Append a grammar token (`from:`, `has:image`) to the query. */
  readonly applyFilter: (token: string) => void;
  /** Ask the shell to open the hit's channel at that message, and remember the query. */
  readonly jumpTo: (hit: JsSearchHit) => void;
}
