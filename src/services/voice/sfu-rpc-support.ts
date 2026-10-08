/**
 * The SFU RPC wire shapes, its timing constants and small helpers. Shared by
 * `SfuRpc` (`sfu-rpc.ts`, which re-exports the envelope types) and the
 * direct-WebSocket connect (`sfu-rpc-direct.ts`).
 */
/**
 * 8-byte random hex - used as the per-connection identifier the SFU
 * disambiguates devices on. Collisions inside a single user's session
 * are infeasible. Falls back to a Date-based id in environments without
 * `crypto.getRandomValues` (older test runners), which is fine - the
 * SFU treats the value as opaque.
 */
export function mintClientId(): string {
  try {
    const buf = new Uint8Array(8);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export interface RpcRequestEnvelope<T = unknown> {
  type: 'request';
  requestId: string;
  method: string;
  data?: T;
  /**
   * Per-connection id minted once per SfuRpc instance. The SFU keys its
   * peer table by `pubkey + clientId` so two devices signing with the
   * same Nostr pubkey don't collide on the same mediasoup transport
   * slot (the second device used to close + recreate the first device's
   * transports, kicking it).
   */
  clientId?: string;
}

export interface RpcResponseOk<T = unknown> {
  type: 'response';
  requestId: string;
  ok: true;
  data?: T;
}

export interface RpcResponseErr {
  type: 'response';
  requestId: string;
  ok: false;
  error: { message: string; code?: string };
}

export type RpcResponse<T = unknown> = RpcResponseOk<T> | RpcResponseErr;

export interface RpcNotification<T = unknown> {
  type: 'notification';
  method: string;
  data?: T;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRpcTimeout(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith('rpc timeout:');
}

export interface PendingCall {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class DirectRpcError extends Error {
  constructor(message: string, readonly closeCode = 0) {
    super(message);
  }
}
