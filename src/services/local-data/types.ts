/**
 * The shape of the local-data inventory: every place Obelisk keeps
 * something in the browser, grouped into the categories a person sees in
 * Settings > Data on this device and on the `/help/local-data` page.
 *
 * `holds` and `why` are notes for developers (English, never shown). What a
 * person reads is the category's copy under `help.localData.categories.*`.
 */

/** The groups shown to a person, in display order (see `categories.ts`). */
export type LocalDataCategoryId =
  | 'channels'
  | 'profiles'
  | 'readState'
  | 'dmMessages'
  | 'dms'
  | 'preferences'
  | 'personal'
  | 'login'
  | 'wallet'
  | 'offline'
  | 'language'
  | 'analytics';

/** Which browser store an entry lives in. */
export type LocalDataArea = 'localStorage' | 'sessionStorage' | 'indexedDB' | 'cacheStorage' | 'cookie';

export interface LocalDataEntry {
  /** Stable id, unique across the inventory. */
  readonly id: string;
  readonly area: LocalDataArea;
  /** The key, database name, cache-name prefix or cookie name. */
  readonly key: string;
  /** `prefix`: every key that starts with `key` (per-account or per-item keys). */
  readonly match: 'exact' | 'prefix';
  /**
   * Narrows a shared prefix. The bridge cache is one prefix holding three
   * categories (profiles, read positions, the rest); `when` says which.
   */
  readonly when?: (key: string) => boolean;
  readonly category: LocalDataCategoryId;
  /** What is in it. */
  readonly holds: string;
  /** What gets slower or is lost without it. */
  readonly why: string;
  /** One copy per logged-in account (`<base>:<pubkey>` keys). */
  readonly perAccount: boolean;
  /** Says something private about the person (who they talk to, what they read, a sealed secret). */
  readonly sensitive: boolean;
  /**
   * Today's code no longer writes it: an older version or the SDK did. It is
   * still removed, so a device that ran the old code is cleaned too.
   */
  readonly legacy?: boolean;
  /** The file that owns it. */
  readonly source: string;
}
