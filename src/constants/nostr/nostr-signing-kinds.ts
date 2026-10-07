/**
 * Nostr: nostr signing kinds. Values the code in
 * `utils/nostr/nostr-signing-kinds.ts` reads, kept here so every reader
 * imports the one copy.
 */

export const OBELISK_SIGNING_KINDS = [
  0, 1, 3, 4, 5, 6, 7, 9, 13, 14, 1059, 2390,
  9000, 9001, 9002, 9003, 9005, 9007, 9021, 9022, 9734,
  10000, 10002, 10030, 10050, 20078, 22242, 24242,
  25050, 25052, 27235, 30030, 30078,
] as const;
