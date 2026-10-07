/**
 * Voice: sfu transports. Values the code in `services/voice/sfu-transports.ts`
 * reads, kept here so every reader imports the one copy.
 */

export const STARTUP_RPC_RETRY = { attempts: 4, timeoutMs: 1800, retryDelayMs: 75 } as const;
