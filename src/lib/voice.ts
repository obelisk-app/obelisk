/**
 * mediasoup WebRTC Voice/Video/Screen Client
 *
 * Audio/Video/Screen all go through WebRTC via a mediasoup SFU.
 * Signaling happens over Socket.io. Media flows over UDP (WebRTC).
 *
 * This gives us: Opus codec, built-in echo cancellation, adaptive
 * jitter buffer, ~50-100ms latency — all handled by the browser.
 */

import type { Socket } from 'socket.io-client';
import { Device, types as msTypes } from 'mediasoup-client';

export interface VoiceParticipant {
  pubkey: string;
  muted: boolean;
  deafened: boolean;
  joinedAt: string;
}

export class WebSocketVoiceClient {
  private socket: Socket;
  private device: Device | null = null;
  private sendTransport: msTypes.Transport | null = null;
  private recvTransport: msTypes.Transport | null = null;

  // Producers (what we send)
  private audioProducer: msTypes.Producer | null = null;
  private videoProducer: msTypes.Producer | null = null;
  private screenProducer: msTypes.Producer | null = null;

  // Consumers (what we receive)
  private consumers: Map<string, msTypes.Consumer> = new Map();
  private remoteAudioElements: Map<string, HTMLAudioElement> = new Map();

  private channelId: string | null = null;
  private localStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private isMuted = false;
  private isDeafened = false;
  private rtpCapabilities: msTypes.RtpCapabilities | null = null;
  private recvTransportId: string | null = null;

  // Remote video playback
  private remoteVideoElements: Map<string, HTMLVideoElement> = new Map();
  private remoteScreenElements: Map<string, HTMLVideoElement> = new Map();

  // Callbacks
  onConnectionStateChange?: (state: string) => void;
  onError?: (error: string) => void;
  onRemoteVideoElement?: (pubkey: string, element: HTMLVideoElement | null) => void;
  onRemoteScreenElement?: (pubkey: string, element: HTMLVideoElement | null) => void;
  onLocalCameraStream?: (stream: MediaStream | null) => void;
  onLocalScreenStream?: (stream: MediaStream | null) => void;

  constructor(socket: Socket) {
    this.socket = socket;
  }

  // ── Join / Leave ─────────────────────────────────────────────

  async join(channelId: string): Promise<void> {
    this.channelId = channelId;

    // 1. Join voice room — get router RTP capabilities + existing producers
    const joinResult = await this.emitWithAck('join-voice', channelId);
    if (joinResult.error) throw new Error(joinResult.error);

    this.rtpCapabilities = joinResult.rtpCapabilities;

    // 2. Create mediasoup Device and load capabilities
    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: joinResult.rtpCapabilities });

    // 3. Create send and recv transports
    this.sendTransport = await this.createTransport('send');
    this.recvTransport = await this.createTransport('recv');
    this.recvTransportId = this.recvTransport.id;

    // 4. Get mic and produce audio
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
      },
      video: false,
    });

    const audioTrack = this.localStream.getAudioTracks()[0];
    this.audioProducer = await this.sendTransport.produce({
      track: audioTrack,
      codecOptions: { opusStereo: false, opusDtx: true },
      appData: { type: 'audio' },
    });

    // 5. Consume existing producers from other peers
    for (const p of joinResult.existingProducers || []) {
      await this.consumeProducer(p.producerId, p.pubkey, p.kind, p.appData);
    }

    // 6. Listen for new producers
    this.socket.on('new-producer', this.handleNewProducer);
    this.socket.on('producer-closed', this.handleProducerClosed);

    this.onConnectionStateChange?.('connected');
  }

  async leave(): Promise<void> {
    await this.stopCamera();
    await this.stopScreenShare();

    this.socket.off('new-producer', this.handleNewProducer);
    this.socket.off('producer-closed', this.handleProducerClosed);

    // Close all consumers
    for (const consumer of this.consumers.values()) {
      consumer.close();
    }
    this.consumers.clear();

    // Clean up remote audio elements
    for (const el of this.remoteAudioElements.values()) {
      el.pause();
      el.srcObject = null;
    }
    this.remoteAudioElements.clear();

    // Clean up remote video elements
    for (const [pk, el] of this.remoteVideoElements) {
      el.pause(); el.srcObject = null;
      this.onRemoteVideoElement?.(pk, null);
    }
    this.remoteVideoElements.clear();
    for (const [pk, el] of this.remoteScreenElements) {
      el.pause(); el.srcObject = null;
      this.onRemoteScreenElement?.(pk, null);
    }
    this.remoteScreenElements.clear();

    // Close producers
    if (this.audioProducer) { this.audioProducer.close(); this.audioProducer = null; }
    if (this.videoProducer) { this.videoProducer.close(); this.videoProducer = null; }
    if (this.screenProducer) { this.screenProducer.close(); this.screenProducer = null; }

    // Close transports
    if (this.sendTransport) { this.sendTransport.close(); this.sendTransport = null; }
    if (this.recvTransport) { this.recvTransport.close(); this.recvTransport = null; }

    // Stop local mic
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    this.device = null;
    this.rtpCapabilities = null;

    if (this.channelId) {
      this.socket.emit('leave-voice', this.channelId);
    }
    this.channelId = null;
    this.onConnectionStateChange?.('disconnected');
  }

  // ── Audio controls ───────────────────────────────────────────

  mute(): void {
    this.isMuted = true;
    if (this.audioProducer && !this.audioProducer.closed) {
      this.audioProducer.pause();
      this.socket.emit('producer-pause', { producerId: this.audioProducer.id });
    }
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = false; });
  }

  unmute(): void {
    this.isMuted = false;
    if (this.audioProducer && !this.audioProducer.closed) {
      this.audioProducer.resume();
      this.socket.emit('producer-resume', { producerId: this.audioProducer.id });
    }
    this.localStream?.getAudioTracks().forEach(t => { t.enabled = true; });
  }

  setDeafened(deafened: boolean): void {
    this.isDeafened = deafened;
    for (const el of this.remoteAudioElements.values()) {
      el.muted = deafened;
    }
    for (const el of this.remoteVideoElements.values()) {
      el.muted = deafened;
    }
  }

  // ── Camera ───────────────────────────────────────────────────

  async startCamera(): Promise<void> {
    if (this.cameraStream || !this.sendTransport) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera is not supported on this device');
    }
    this.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15 } },
      audio: false,
    });
    this.onLocalCameraStream?.(this.cameraStream);

    const videoTrack = this.cameraStream.getVideoTracks()[0];
    this.videoProducer = await this.sendTransport.produce({
      track: videoTrack,
      appData: { type: 'camera' },
    });
  }

  async stopCamera(): Promise<void> {
    if (this.videoProducer && !this.videoProducer.closed) {
      this.socket.emit('producer-close', { producerId: this.videoProducer.id });
      this.videoProducer.close();
    }
    this.videoProducer = null;
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
      this.onLocalCameraStream?.(null);
    }
  }

  // ── Screen Share ─────────────────────────────────────────────

  async startScreenShare(): Promise<void> {
    if (this.screenStream || !this.sendTransport) return;
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('Screen sharing is not supported on this device');
    }
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 15 } },
      audio: false,
    });
    this.screenStream.getVideoTracks()[0].onended = () => { this.stopScreenShare(); };
    this.onLocalScreenStream?.(this.screenStream);

    const screenTrack = this.screenStream.getVideoTracks()[0];
    this.screenProducer = await this.sendTransport.produce({
      track: screenTrack,
      appData: { type: 'screen' },
    });
  }

  async stopScreenShare(): Promise<void> {
    if (this.screenProducer && !this.screenProducer.closed) {
      this.socket.emit('producer-close', { producerId: this.screenProducer.id });
      this.screenProducer.close();
    }
    this.screenProducer = null;
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
      this.onLocalScreenStream?.(null);
    }
  }

  destroy(): void { this.leave(); }

  // ── Private: Transport creation ──────────────────────────────

  private async createTransport(direction: 'send' | 'recv'): Promise<msTypes.Transport> {
    const result = await this.emitWithAck('create-transport', {});
    if (result.error) throw new Error(result.error);

    const transport = direction === 'send'
      ? this.device!.createSendTransport({
          id: result.id,
          iceParameters: result.iceParameters,
          iceCandidates: result.iceCandidates,
          dtlsParameters: result.dtlsParameters,
        })
      : this.device!.createRecvTransport({
          id: result.id,
          iceParameters: result.iceParameters,
          iceCandidates: result.iceCandidates,
          dtlsParameters: result.dtlsParameters,
        });

    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        const res = await this.emitWithAck('connect-transport', {
          transportId: transport.id,
          dtlsParameters,
        });
        if (res.error) throw new Error(res.error);
        callback();
      } catch (err: any) {
        errback(err);
      }
    });

    if (direction === 'send') {
      transport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
        try {
          const res = await this.emitWithAck('produce', {
            transportId: transport.id,
            kind,
            rtpParameters,
            appData,
          });
          if (res.error) throw new Error(res.error);
          callback({ id: res.id });
        } catch (err: any) {
          errback(err);
        }
      });
    }

    return transport;
  }

  // ── Private: Consuming remote producers ──────────────────────

  private handleNewProducer = async ({ producerId, pubkey, kind, appData }: any) => {
    await this.consumeProducer(producerId, pubkey, kind, appData);
  };

  private handleProducerClosed = ({ producerId }: any) => {
    for (const [cid, consumer] of this.consumers) {
      if (consumer.producerId === producerId) {
        consumer.close();
        this.consumers.delete(cid);
        break;
      }
    }

    const audioEl = this.remoteAudioElements.get(producerId);
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      this.remoteAudioElements.delete(producerId);
    }

    for (const [pk, el] of this.remoteVideoElements) {
      if (el.dataset.producerId === producerId) {
        el.pause(); el.srcObject = null;
        this.remoteVideoElements.delete(pk);
        this.onRemoteVideoElement?.(pk, null);
        break;
      }
    }
    for (const [pk, el] of this.remoteScreenElements) {
      if (el.dataset.producerId === producerId) {
        el.pause(); el.srcObject = null;
        this.remoteScreenElements.delete(pk);
        this.onRemoteScreenElement?.(pk, null);
        break;
      }
    }
  };

  private async consumeProducer(
    producerId: string,
    pubkey: string,
    kind: string,
    appData: any,
  ): Promise<void> {
    if (!this.recvTransport || !this.device) return;

    const result = await this.emitWithAck('consume', {
      transportId: this.recvTransportId,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });
    if (result.error) {
      console.error('[voice] consume error:', result.error);
      return;
    }

    const consumer = await this.recvTransport.consume({
      id: result.id,
      producerId: result.producerId,
      kind: result.kind,
      rtpParameters: result.rtpParameters,
    });

    this.consumers.set(consumer.id, consumer);

    // Resume on server (consumers start paused)
    await this.emitWithAck('resume-consumer', { consumerId: consumer.id });

    const track = consumer.track;
    const mediaType = appData?.type || kind;

    if (kind === 'audio') {
      const audioEl = new Audio();
      audioEl.srcObject = new MediaStream([track]);
      audioEl.muted = this.isDeafened;
      audioEl.play().catch(() => {});
      this.remoteAudioElements.set(producerId, audioEl);
    } else if (kind === 'video') {
      const videoEl = document.createElement('video');
      videoEl.srcObject = new MediaStream([track]);
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videoEl.muted = true;
      videoEl.dataset.producerId = producerId;

      if (mediaType === 'screen') {
        this.remoteScreenElements.set(pubkey, videoEl);
        this.onRemoteScreenElement?.(pubkey, videoEl);
      } else {
        this.remoteVideoElements.set(pubkey, videoEl);
        this.onRemoteVideoElement?.(pubkey, videoEl);
      }
    }
  }

  // ── Private: Socket helper ───────────────────────────────────

  private emitWithAck(event: string, data: any): Promise<any> {
    return new Promise((resolve) => {
      this.socket.emit(event, data, (response: any) => {
        resolve(response || {});
      });
    });
  }
}
