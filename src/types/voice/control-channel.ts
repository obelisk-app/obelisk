import type { VoiceSignalPayload } from './protocol';

export type ControlMessage =
  | { type: 'hello'; peers: string[]; sessionId: string; build: string; signalTransport?: 1 }
  | { type: 'signal'; payload: VoiceSignalPayload }
  | { type: 'peerSnapshot'; peers: string[]; ts: number }
  | { type: 'peerAdded'; pubkey: string }
  | { type: 'peerRemoved'; pubkey: string }
  | { type: 'bye'; reason: string }
  | { type: 'ping'; ts: number }
  | { type: 'pong'; ts: number; echoTs: number };
