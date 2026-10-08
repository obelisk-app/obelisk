/**
 * The mediasoup WebRtcTransport handshake of an `SfuClient`: asking the
 * SFU for a transport, turning its answer into `device.createXTransport`
 * options, and the `connect` / `produce` / `connectionstatechange`
 * handlers that carry the DTLS parameters and the producer RPCs back over
 * `SfuRpc`. The sequencing (send first, then recv, with the `closed`
 * re-checks between the awaits) stays in the client.
 */
import type { DtlsParameters, Transport } from 'mediasoup-client/types';

import type { SfuRpc } from './sfu-rpc';
import type { SfuClientEvents } from '@/types/voice/sfu';
import { ICE_SERVERS } from './ice-config';
import { STARTUP_RPC_RETRY } from '@/constants/voice/sfu-transports';

const CONNECT_RPC_RETRY = { attempts: 3, timeoutMs: 2000, retryDelayMs: 75 } as const;

export interface WebRtcTransportInfo {
  id: string;
  iceParameters: unknown;
  iceCandidates: unknown[];
  dtlsParameters: DtlsParameters;
}

export interface SfuTransportHost {
  rpc: Pick<SfuRpc, 'request' | 'requestWithRetry'>;
  events: Pick<SfuClientEvents, 'onConnectionStateChange'>;
  isClosed(): boolean;
}

export function requestWebRtcTransport(
  rpc: Pick<SfuRpc, 'requestWithRetry'>,
  direction: 'send' | 'recv',
): Promise<WebRtcTransportInfo> {
  return rpc.requestWithRetry<WebRtcTransportInfo>('createWebRtcTransport', { direction }, STARTUP_RPC_RETRY);
}

/** The options `device.createSendTransport` / `createRecvTransport` take. */
export function transportOptions(info: WebRtcTransportInfo) {
  return {
    id: info.id,
    iceParameters: info.iceParameters as never,
    iceCandidates: info.iceCandidates as never,
    dtlsParameters: info.dtlsParameters,
    iceServers: ICE_SERVERS,
  };
}

/** The `connect` handler both directions share: DTLS parameters to the SFU. */
export function wireTransportConnect(transport: Transport, transportId: string, host: SfuTransportHost): void {
  transport.on('connect', ({ dtlsParameters }, callback, errback) => {
    if (host.isClosed()) {
      errback(new Error('SfuClient closed'));
      return;
    }
    host.rpc.requestWithRetry('connectWebRtcTransport', {
      transportId,
      dtlsParameters,
    }, CONNECT_RPC_RETRY).then(() => callback()).catch((err) => errback(err as Error));
  });
}

/** Send transport: for our outbound producers. */
export function wireSendTransport(transport: Transport, transportId: string, host: SfuTransportHost): void {
  wireTransportConnect(transport, transportId, host);
  transport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
    if (host.isClosed()) {
      errback(new Error('SfuClient closed'));
      return;
    }
    host.rpc.request<{ id: string }>('produce', {
      transportId,
      kind,
      rtpParameters,
      appData,
    }).then(({ id }) => callback({ id })).catch((err) => errback(err as Error));
  });
  transport.on('connectionstatechange', (state) => {
    host.events.onConnectionStateChange?.(state);
  });
}
