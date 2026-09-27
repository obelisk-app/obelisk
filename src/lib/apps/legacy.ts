/**
 * Tables created before games moved out of this repo carry a `create` with
 * `["t","obelisk-game"]` and a game name, and no version pin. They are mapped
 * to the official apps and run the official app's CURRENT bundle — the one
 * unpinned path in the system (obelisk-apps docs/app-format.md §4). The
 * official apps keep the old op formats byte-for-byte, so such tables replay.
 *
 * Kind 2390 is pruned after 7 days on public.obelisk.ar, so this only matters
 * for the first week after the switch; remove it after that
 * (docs/known-bugs.md § Apps).
 */
import { appAddress } from './manifest';

/**
 * The key that publishes the first-party apps. Set per deployment; without it
 * legacy tables show as "needs the official app" and can't be opened.
 */
export const OFFICIAL_APPS_PUBKEY = (process.env.NEXT_PUBLIC_OBELISK_APPS_PUBKEY ?? '').toLowerCase();

const LEGACY_SLUGS: Record<string, string> = {
  'chain-reaction': 'chain-reaction',
  vesta: 'vesta',
  stacker: 'stacker',
};

export function legacyAppAddress(game: string, officialPubkey = OFFICIAL_APPS_PUBKEY): string | null {
  const slug = LEGACY_SLUGS[game];
  if (!slug || !/^[0-9a-f]{64}$/.test(officialPubkey)) return null;
  return appAddress(officialPubkey, slug);
}
