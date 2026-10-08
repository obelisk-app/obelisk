import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { quotaSafeLocalStorage } from '@/services/common/quota-safe-storage';
import { createEnsureForAccount } from '../common/multi-account';
import { oneOf, recordOf, versionedPersist, type Upgrade } from '../common/persist-version';

export type DMProtocol = 'nip04' | 'nip17';

const DM_PROTOCOLS: readonly DMProtocol[] = ['nip04', 'nip17'];

/**
 * In-memory shape used by the UI / store. Plaintext lives only in RAM.
 */
export interface DMMessage {
  id: string;
  senderPubkey: string;
  recipientPubkey: string;
  content: string;
  createdAt: number; // unix timestamp (seconds)
  protocol: DMProtocol;
  /** Optimistic-send state: true while the event is still publishing. */
  isPending?: boolean;
  /** Populated when publish fails; presence of this field enables the retry UI. */
  sendError?: string;
}

export interface DMThread {
  pubkey: string; // the other participant
  displayName: string;
  picture?: string;
  lastMessage?: string;
  lastMessageAt?: number;
  protocol?: DMProtocol;
}

interface DMPersistedState {
  /**
   * Per-peer wire protocol the user chose for a thread. NIP-17 is the
   * default; NIP-04 is a per-thread opt-out (docs/features/direct-messages.md).
   * Nothing in the UI writes it today: the protocol prompt that called
   * `setProtocolOverride` was deleted with the old DM view, so this is
   * always empty and every reader falls back to NIP-17.
   */
  protocolOverrides: Record<string, DMProtocol>;
}

interface DMState extends DMPersistedState {
  activeDMPubkey: string | null;
  /**
   * No code reads these six any more (DM threads live in the bridge's
   * `dmsByPeer`); `src/services/common/reset.ts` still clears them on logout, so
   * they stay until that call is pointed elsewhere.
   */
  isDMMode: boolean;
  threads: DMThread[];
  messages: DMMessage[];
  isLoadingMessages: boolean;
  isLoadingThreads: boolean;
  hasMoreHistory: boolean;
  /** Show the protocol choice popup */
  showProtocolPrompt: string | null;

  setProtocolOverride: (pubkey: string, protocol: DMProtocol) => void;
  setShowProtocolPrompt: (pubkey: string | null) => void;
}

/**
 * Saved-shape version.
 *   0  before versioning. Older app versions saved decrypted `threads` and
 *      `messages` here, and a PWA can still hold them.
 *   1  `protocolOverrides` only.
 */
export const DM_STORE_VERSION = 1;

/** Version 0 -> 1: drop everything but the protocol choices, so old plaintext is erased from disk. */
const dropLegacyPlaintext: Upgrade = (raw) => ({ protocolOverrides: raw.protocolOverrides });

/** Keeps only valid per-peer protocol choices; anything else in the blob is ignored. */
export function sanitizeDmPersisted(raw: Record<string, unknown>): DMPersistedState {
  return { protocolOverrides: recordOf(raw.protocolOverrides, (v) => oneOf(v, DM_PROTOCOLS)) };
}

export const useDMStore = create<DMState>()(
  persist(
    (set) => ({
      isDMMode: false,
      activeDMPubkey: null,
      threads: [],
      messages: [],
      isLoadingMessages: false,
      isLoadingThreads: false,
      hasMoreHistory: false,
      protocolOverrides: {},
      showProtocolPrompt: null,

      setProtocolOverride: (pubkey, protocol) =>
        set((state) => ({
          protocolOverrides: { ...state.protocolOverrides, [pubkey]: protocol },
          showProtocolPrompt: null,
        })),
      setShowProtocolPrompt: (pubkey) => set({ showProtocolPrompt: pubkey }),
    }),
    {
      name: 'obelisk-dm-store',
      storage: createJSONStorage(() => quotaSafeLocalStorage),
      // The DM store persists *only* the per-peer protocol choices. Read
      // state lives in `useReadStateStore` (`obelisk-read-state:{pubkey}`);
      // DM threads and messages are in the bridge and never touch disk.
      partialize: (state): DMPersistedState => ({ protocolOverrides: state.protocolOverrides }),
      // A version 0 blob is upgraded (plaintext dropped) and saved back
      // without it. Whatever the version, `sanitizeDmPersisted` takes
      // `protocolOverrides` and nothing else, so no plaintext reaches memory.
      ...versionedPersist<DMState, DMPersistedState>({
        version: DM_STORE_VERSION,
        upgrades: { 0: dropLegacyPlaintext },
        sanitize: sanitizeDmPersisted,
      }),
    },
  ),
);

/**
 * Multi-account isolation: swaps the persist key to `obelisk-dm-store:{pubkey}`
 * so per-peer protocol overrides don't leak across logins. Idempotent.
 */
export const ensureDMStoreForAccount = createEnsureForAccount(
  'obelisk-dm-store',
  useDMStore,
);
