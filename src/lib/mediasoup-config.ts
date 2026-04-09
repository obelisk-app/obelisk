/**
 * mediasoup SFU configuration.
 *
 * Worker: Spawns a native C++ process that handles all RTP media.
 * Router: Routes media between producers and consumers with codec negotiation.
 * Transport: WebRTC transport for each peer (one send, one recv).
 */

import type { WorkerSettings, RouterOptions, WebRtcTransportOptions } from 'mediasoup/node/lib/types';

export const workerSettings: WorkerSettings = {
  logLevel: 'warn',
  rtcMinPort: parseInt(process.env.MEDIASOUP_MIN_PORT || '40000', 10),
  rtcMaxPort: parseInt(process.env.MEDIASOUP_MAX_PORT || '40100', 10),
};

export const routerOptions: RouterOptions = {
  mediaCodecs: [
    {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: 'video',
      mimeType: 'video/VP8',
      clockRate: 90000,
      parameters: {
        'x-google-start-bitrate': 1000,
      },
    },
  ],
};

export function getTransportOptions(): WebRtcTransportOptions {
  const announcedAddress = process.env.MEDIASOUP_ANNOUNCED_IP || undefined;

  return {
    listenInfos: [
      {
        protocol: 'udp',
        ip: '0.0.0.0',
        announcedAddress,
      },
      {
        protocol: 'tcp',
        ip: '0.0.0.0',
        announcedAddress,
      },
    ],
    initialAvailableOutgoingBitrate: 1_000_000,
  };
}
