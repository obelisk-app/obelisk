/**
 * How much each category takes, for the settings screen. Web storage is
 * measured exactly (characters, as UTF-16 bytes); the offline files from
 * their Content-Length headers; the encrypted DM store by reading its
 * records; the vault key and the language cookie are a few bytes each and
 * are reported as present or not, not sized.
 */
import { LOCAL_DATA_CATEGORIES } from '@/constants/local-data/categories';
import { cookiesIn, databasesBytes, offlineFilesBytes } from './browser-stores';
import { keysIn, localStorageBytes } from './web-storage';
import type { LocalDataCategoryId } from '@/types/local-data/inventory';

export interface CategoryUsage {
  /** Approximate bytes, or `null` when it cannot be measured. */
  readonly bytes: number | null;
  /** Anything stored at all. */
  readonly present: boolean;
}

export type LocalDataUsage = Record<LocalDataCategoryId, CategoryUsage>;

/** The synchronous part: every category, with the offline files not yet measured. */
export function measureWebStorage(doc?: Document): LocalDataUsage {
  const out = {} as Record<LocalDataCategoryId, CategoryUsage>;
  for (const { id } of LOCAL_DATA_CATEGORIES) {
    const bytes = localStorageBytes([id]);
    const tabKeys = keysIn('sessionStorage', [id]).length;
    out[id] = { bytes, present: bytes > 0 || tabKeys > 0 };
  }
  // Cookies are a few bytes each: reported as present or not. The
  // Analytics answer is a few bytes of localStorage beside its cookies.
  out.language = { bytes: null, present: cookiesIn(['language'], doc).length > 0 };
  out.analytics = {
    bytes: null,
    present: out.analytics.present || cookiesIn(['analytics'], doc).length > 0,
  };
  // The vault key (IndexedDB) is not sized: it exists exactly when the
  // session record does, which `login` already counts.
  return out;
}

/** Add the offline files' and the encrypted DM store's size (async: Cache Storage, IndexedDB). */
export async function measureLocalData(
  store?: CacheStorage,
  doc?: Document,
  factory?: IDBFactory,
): Promise<LocalDataUsage> {
  const usage = measureWebStorage(doc);
  const dmBytes = await databasesBytes('dmMessages', factory);
  if (dmBytes !== null) usage.dmMessages = { bytes: dmBytes, present: dmBytes > 0 };
  const offline = await offlineFilesBytes(store);
  const base = usage.offline.bytes ?? 0;
  usage.offline = offline === null
    ? usage.offline
    : { bytes: base + offline, present: base + offline > 0 };
  return usage;
}
