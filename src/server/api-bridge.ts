// src/server/api-bridge.ts
// Re-export shim so Next.js API routes can import via the `@/server/api-bridge`
// alias.  The real implementation lives in `server/api-bridge.ts` (root level).
export { getIO, getContext, bindContext, disconnectPubkey, emitModEvent } from '../../server/api-bridge';
