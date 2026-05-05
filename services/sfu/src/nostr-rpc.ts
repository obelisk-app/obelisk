/**
 * Request/response RPC over kind 25050. Each request body has a unique
 * `requestId`; the matching response echoes it. Notifications are pushed
 * one-way (no id, no ack).
 *
 * Wire format — JSON inside the kind 25050 `content` field (cleartext for
 * v1; NIP-44 wrapping is a Phase-2 polish item, see migration doc §"Open
 * questions").
 *
 *   request:      { type:'request',  requestId, method, data? }
 *   response:     { type:'response', requestId, ok: true,  data? }
 *                 { type:'response', requestId, ok: false, error: { message, code? } }
 *   notification: { type:'notification', method, data? }
 *
 * The handler signature is method-keyed: `handlers[method]` resolves a
 * request → response data, or throws to send back `ok: false`.
 */
import type { Hex } from './types.js';

export type RpcMethod = string;

export interface RpcRequest<T = unknown> {
  type: 'request';
  requestId: string;
  method: RpcMethod;
  data?: T;
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
  method: RpcMethod;
  data?: T;
}

export type RpcEnvelope<T = unknown> = RpcRequest<T> | RpcResponse<T> | RpcNotification<T>;

/** Thrown by handlers to surface a structured error to the caller. */
export class RpcError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Parse a kind 25050 content body into an RPC envelope. Returns `null` if
 * the body isn't valid JSON or doesn't match the schema — callers fall back
 * to legacy SDP/ICE handling for werift-era clients during the transition.
 */
export function parseEnvelope(content: string): RpcEnvelope | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const type = obj.type;
  if (type === 'request') {
    if (typeof obj.requestId !== 'string' || typeof obj.method !== 'string') return null;
    return { type: 'request', requestId: obj.requestId, method: obj.method, data: obj.data };
  }
  if (type === 'response') {
    if (typeof obj.requestId !== 'string' || typeof obj.ok !== 'boolean') return null;
    if (obj.ok === true) {
      return { type: 'response', requestId: obj.requestId, ok: true, data: obj.data };
    }
    const err = (obj.error as Record<string, unknown> | undefined) ?? {};
    const message = typeof err.message === 'string' ? err.message : 'unknown error';
    return typeof err.code === 'string'
      ? { type: 'response', requestId: obj.requestId, ok: false, error: { message, code: err.code } }
      : { type: 'response', requestId: obj.requestId, ok: false, error: { message } };
  }
  if (type === 'notification') {
    if (typeof obj.method !== 'string') return null;
    return { type: 'notification', method: obj.method, data: obj.data };
  }
  return null;
}

export interface RpcContext {
  channelId: string;
  fromPubkey: Hex;
  /** Send a notification back to the originating peer. */
  notify<T>(method: RpcMethod, data?: T): Promise<void>;
}

export type RpcHandler<TIn = unknown, TOut = unknown> = (
  ctx: RpcContext,
  data: TIn,
) => Promise<TOut> | TOut;

export type RpcHandlerMap = Record<RpcMethod, RpcHandler>;

/**
 * Dispatch a parsed request to the appropriate handler and return the
 * response envelope to send back. Centralizes error shaping so handlers
 * can just throw `RpcError` (or any Error) and we always emit a clean
 * `ok: false` payload to the caller.
 */
export async function dispatchRequest(
  handlers: RpcHandlerMap,
  ctx: RpcContext,
  req: RpcRequest,
): Promise<RpcResponse> {
  const handler = handlers[req.method];
  if (!handler) {
    return {
      type: 'response',
      requestId: req.requestId,
      ok: false,
      error: { message: `unknown method: ${req.method}`, code: 'METHOD_NOT_FOUND' },
    };
  }
  try {
    const data = await handler(ctx, req.data);
    return { type: 'response', requestId: req.requestId, ok: true, data };
  } catch (err) {
    const e = err as Error;
    const message = e.message ?? 'handler threw';
    const code = err instanceof RpcError ? err.code : undefined;
    return code
      ? { type: 'response', requestId: req.requestId, ok: false, error: { message, code } }
      : { type: 'response', requestId: req.requestId, ok: false, error: { message } };
  }
}
