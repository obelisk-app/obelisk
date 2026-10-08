import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearAllClientCacheExceptSession } from "@/services/local-data/cache-clear";

import { lowerAllWriteFences } from '@/services/local-data/write-fence';

afterEach(() => lowerAllWriteFences());

const PUBKEY = "a".repeat(64);
const wiped = [
  "obelisk-cache-v4/public.obelisk.ar/39000/group-1",
  "obelisk-cache-v3/public.obelisk.ar/39000/group-1",
  "obelisk-cache-v2/old-key",
  "obelisk-cache/older-key",
  "obelisk-read-state:" + PUBKEY,
  "obelisk-dm-store:" + PUBKEY,
  // Must be wiped with the two above: the ledger suppresses re-opening gift
  // wraps because their effects are already in the DM store and the cursor
  // cache. Keeping it while wiping those would suppress the only events that
  // could rebuild them.
  "obelisk-wrap-ledger:" + PUBKEY,
  "obelisk-notifications:" + PUBKEY,
  "obelisk-dex/recent-relays/" + PUBKEY,
  "obelisk:relay-info-v3",
  "obelisk:relay-info-v2",
  "obelisk/profile-sync-cache/v1",
  "obelisk/profile-sync-state/v1",
];

// The login, preferences and layout, and what exists only on this device
// (mutes, channel choices, saved stickers): "clear cache" is a recovery
// tool and must not cost the person anything the relays cannot send back.
const preserved = [
  "obelisk-dex/session",
  "obelisk-dex/relays",
  "obelisk:preferences",
  "obelisk:voice-chat-width",
  "obelisk-dex/forum-collapsed/group-1",
  "obelisk-forum-follow:" + PUBKEY,
  "obelisk:moderation:" + PUBKEY,
  "obelisk-channel-prefs:" + PUBKEY,
  "obelisk:personal-stickers",
  "unrelated-key",
];

describe("clearAllClientCacheExceptSession", () => {
  beforeEach(() => localStorage.clear());

  it.each(wiped)("removes %s", (key) => {
    localStorage.setItem(key, "value");
    expect(clearAllClientCacheExceptSession()).toBe(1);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("preserves the login, preferences, device-only data and unrelated keys", () => {
    preserved.forEach((key) => localStorage.setItem(key, "value"));
    expect(clearAllClientCacheExceptSession()).toBe(0);
    preserved.forEach((key) => expect(localStorage.getItem(key)).toBe("value"));
  });

  it("blocks stale writers while recovery waits to reload", () => {
    localStorage.setItem(wiped[0], "before");
    clearAllClientCacheExceptSession();
    localStorage.setItem(wiped[0], "late relay response");
    sessionStorage.setItem(wiped[0], "late tab write");
    localStorage.setItem(preserved[0], "session stays writable");
    expect(localStorage.getItem(wiped[0])).toBeNull();
    expect(sessionStorage.getItem(wiped[0])).toBeNull();
    expect(localStorage.getItem(preserved[0])).toBe("session stays writable");
  });

  it("is idempotent", () => {
    localStorage.setItem(wiped[0], "value");
    expect(clearAllClientCacheExceptSession()).toBe(1);
    expect(clearAllClientCacheExceptSession()).toBe(0);
  });
});
