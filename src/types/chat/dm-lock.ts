import type { DmEncryptedMessage } from './dm-encrypted';

export type DmLockStatus = 'locked' | 'unlocking' | 'unlocked' | 'failed';

export interface DmLockState {
  readonly status: DmLockStatus;
  /** Held messages still being opened after the local storage key was unlocked. */
  readonly pendingDecryptions?: number;
  /** Failed message decryptions retained for an explicit retry. */
  readonly failedDecryptions?: number;
  readonly encryptedMessages?: ReadonlyArray<DmEncryptedMessage>;
  /** Created-at (unix ms) of each gift wrap held while locked that the store does not hold. */
  readonly unopened: ReadonlyArray<number>;
}

export type HeldKind = 'wrap' | 'nip04';

