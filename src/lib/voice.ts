/**
 * WebSocket Voice/Video/Screen Client
 *
 * Sends/receives audio, video, and screen share over Socket.io.
 * This works through tunnels and proxies (Cloudflare Tunnel, etc.)
 * at the cost of higher latency compared to WebRTC.
 *
 * Audio: Mic → ScriptProcessorNode → PCM Float32 → Socket.io → Ring buffer playback
 * Video/Screen: MediaRecorder (VP8 webm) → chunks → Socket.io → MediaSource playback
 *
 * See /docs/voice-system.md for limitations and upgrade path.
 */

import type { Socket } from 'socket.io-client';

export interface VoiceParticipant {
  pubkey: string;
  muted: boolean;
  deafened: boolean;
  joinedAt: string;
}

// Audio config
const SAMPLE_RATE = 48000;
const FRAME_SIZE = 1024; // ~21ms at 48kHz (must be power of 2 for ScriptProcessorNode)

// Video config
const VIDEO_BITRATE = 500_000; // 500 kbps — reasonable for WebSocket relay
const VIDEO_FRAME_RATE = 15;
const RECORDER_TIMESLICE = 200; // ms between MediaRecorder chunks

export class WebSocketVoiceClient {
  private socket: Socket;
  private audioContext: AudioContext | null = null;
  private localStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private remoteGainNodes: Map<string, { gainNode: GainNode; nextWriteOffset: number; buffer: AudioBuffer }> = new Map();
  private channelId: string | null = null;
  private isMuted = false;
  private isDeafened = false;

  // Video/Screen state
  private cameraStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private cameraRecorder: MediaRecorder | null = null;
  private screenRecorder: MediaRecorder | null = null;

  // Remote video playback: pubkey → video element
  private remoteVideoElements: Map<string, HTMLVideoElement> = new Map();
  private remoteScreenElements: Map<string, HTMLVideoElement> = new Map();
  // MediaSource for receiving video chunks
  private remoteVideoSources: Map<string, { ms: MediaSource; sb: SourceBuffer | null; queue: ArrayBuffer[] }> = new Map();
  private remoteScreenSources: Map<string, { ms: MediaSource; sb: SourceBuffer | null; queue: ArrayBuffer[] }> = new Map();

  // Callbacks the UI can subscribe to
  onConnectionStateChange?: (state: string) => void;
  onError?: (error: string) => void;
  // Called when a remote video/screen element is created or removed
  onRemoteVideoElement?: (pubkey: string, element: HTMLVideoElement | null) => void;
  onRemoteScreenElement?: (pubkey: string, element: HTMLVideoElement | null) => void;
  // Called with local preview streams
  onLocalCameraStream?: (stream: MediaStream | null) => void;
  onLocalScreenStream?: (stream: MediaStream | null) => void;

  constructor(socket: Socket) {
    this.socket = socket;
  }

  async join(channelId: string): Promise<void> {
    this.channelId = channelId;

    // 1. Create AudioContext
    this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });

    // 2. Get microphone
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: SAMPLE_RATE,
      },
      video: false,
    });

    // 3. Set up capture pipeline: mic → processor → socket
    this.sourceNode = this.audioContext.createMediaStreamSource(this.localStream);
    this.processorNode = this.audioContext.createScriptProcessor(FRAME_SIZE, 1, 1);

    this.processorNode.onaudioprocess = (e) => {
      if (this.isMuted) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const buffer = new Float32Array(inputData.length);
      buffer.set(inputData);
      this.socket.emit('voice-audio', buffer.buffer);
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    // 4. Listen for incoming media
    this.socket.on('voice-audio', this.handleRemoteAudio);
    this.socket.on('voice-video', this.handleRemoteVideo);
    this.socket.on('voice-screen', this.handleRemoteScreen);
    this.socket.on('voice-video-start', this.handleRemoteVideoStart);
    this.socket.on('voice-video-stop', this.handleRemoteVideoStop);
    this.socket.on('voice-screen-start', this.handleRemoteScreenStart);
    this.socket.on('voice-screen-stop', this.handleRemoteScreenStop);

    // 5. Join the voice room on server
    this.socket.emit('join-voice', channelId);

    this.onConnectionStateChange?.('connected');
  }

  async leave(): Promise<void> {
    // Stop camera/screen if active
    await this.stopCamera();
    await this.stopScreenShare();

    // Remove socket listeners
    this.socket.off('voice-audio', this.handleRemoteAudio);
    this.socket.off('voice-video', this.handleRemoteVideo);
    this.socket.off('voice-screen', this.handleRemoteScreen);
    this.socket.off('voice-video-start', this.handleRemoteVideoStart);
    this.socket.off('voice-video-stop', this.handleRemoteVideoStop);
    this.socket.off('voice-screen-start', this.handleRemoteScreenStart);
    this.socket.off('voice-screen-stop', this.handleRemoteScreenStop);

    // Disconnect audio pipeline
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    // Stop mic
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }

    // Clean up remote audio
    for (const { gainNode } of this.remoteGainNodes.values()) {
      gainNode.disconnect();
    }
    this.remoteGainNodes.clear();

    // Clean up remote video/screen elements
    this.cleanupAllRemoteMedia();

    // Close audio context
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.channelId = null;
    this.onConnectionStateChange?.('disconnected');
  }

  // ── Audio controls ───────────────────────────────────────────

  mute(): void {
    this.isMuted = true;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => { t.enabled = false; });
    }
  }

  unmute(): void {
    this.isMuted = false;
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach(t => { t.enabled = true; });
    }
  }

  setDeafened(deafened: boolean): void {
    this.isDeafened = deafened;
    for (const { gainNode } of this.remoteGainNodes.values()) {
      gainNode.gain.value = deafened ? 0 : 1;
    }
  }

  // ── Camera ───────────────────────────────────────────────────

  async startCamera(): Promise<void> {
    if (this.cameraStream) return;

    this.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: VIDEO_FRAME_RATE },
      },
      audio: false,
    });

    this.onLocalCameraStream?.(this.cameraStream);
    this.startMediaRecorder(this.cameraStream, 'voice-video', (recorder) => {
      this.cameraRecorder = recorder;
    });
    this.socket.emit('voice-video-start');
  }

  async stopCamera(): Promise<void> {
    if (this.cameraRecorder) {
      this.cameraRecorder.stop();
      this.cameraRecorder = null;
    }
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
      this.onLocalCameraStream?.(null);
      this.socket.emit('voice-video-stop');
    }
  }

  // ── Screen Share ─────────────────────────────────────────────

  async startScreenShare(): Promise<void> {
    if (this.screenStream) return;

    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: VIDEO_FRAME_RATE },
      },
      audio: false,
    });

    // Handle user clicking "Stop sharing" in browser UI
    this.screenStream.getVideoTracks()[0].onended = () => {
      this.stopScreenShare();
    };

    this.onLocalScreenStream?.(this.screenStream);
    this.startMediaRecorder(this.screenStream, 'voice-screen', (recorder) => {
      this.screenRecorder = recorder;
    });
    this.socket.emit('voice-screen-start');
  }

  async stopScreenShare(): Promise<void> {
    if (this.screenRecorder) {
      this.screenRecorder.stop();
      this.screenRecorder = null;
    }
    if (this.screenStream) {
      this.screenStream.getTracks().forEach(t => t.stop());
      this.screenStream = null;
      this.onLocalScreenStream?.(null);
      this.socket.emit('voice-screen-stop');
    }
  }

  destroy(): void {
    this.leave();
  }

  // ── Private: MediaRecorder helpers ───────────────────────────

  private startMediaRecorder(
    stream: MediaStream,
    socketEvent: string,
    onRecorder: (recorder: MediaRecorder) => void,
  ): void {
    // Pick a supported codec
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: VIDEO_BITRATE,
    });

    recorder.ondataavailable = async (e) => {
      if (e.data.size > 0) {
        const buffer = await e.data.arrayBuffer();
        this.socket.emit(socketEvent, buffer);
      }
    };

    recorder.start(RECORDER_TIMESLICE);
    onRecorder(recorder);
  }

  // ── Private: Audio handling ──────────────────────────────────

  private handleRemoteAudio = ({ pubkey, data }: { pubkey: string; data: ArrayBuffer }) => {
    if (!this.audioContext || this.audioContext.state === 'closed') return;

    const pcmData = new Float32Array(data);

    let remote = this.remoteGainNodes.get(pubkey);
    if (!remote) {
      const buffer = this.audioContext.createBuffer(1, SAMPLE_RATE, SAMPLE_RATE);
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = this.isDeafened ? 0 : 1;
      gainNode.connect(this.audioContext.destination);

      const bufferSource = this.audioContext.createBufferSource();
      bufferSource.buffer = buffer;
      bufferSource.loop = true;
      bufferSource.connect(gainNode);
      bufferSource.start();

      remote = { gainNode, nextWriteOffset: 0, buffer };
      this.remoteGainNodes.set(pubkey, remote);
    }

    const channelData = remote.buffer.getChannelData(0);
    for (let i = 0; i < pcmData.length; i++) {
      channelData[(remote.nextWriteOffset + i) % channelData.length] = pcmData[i];
    }
    remote.nextWriteOffset = (remote.nextWriteOffset + pcmData.length) % channelData.length;
  };

  // ── Private: Video/Screen handling ───────────────────────────

  private handleRemoteVideoStart = ({ pubkey }: { pubkey: string }) => {
    this.ensureRemoteVideoElement(pubkey, 'video');
  };

  private handleRemoteVideoStop = ({ pubkey }: { pubkey: string }) => {
    this.cleanupRemoteMedia(pubkey, 'video');
  };

  private handleRemoteScreenStart = ({ pubkey }: { pubkey: string }) => {
    this.ensureRemoteVideoElement(pubkey, 'screen');
  };

  private handleRemoteScreenStop = ({ pubkey }: { pubkey: string }) => {
    this.cleanupRemoteMedia(pubkey, 'screen');
  };

  private handleRemoteVideo = ({ pubkey, data }: { pubkey: string; data: ArrayBuffer }) => {
    this.feedRemoteChunk(pubkey, data, 'video');
  };

  private handleRemoteScreen = ({ pubkey, data }: { pubkey: string; data: ArrayBuffer }) => {
    this.feedRemoteChunk(pubkey, data, 'screen');
  };

  private ensureRemoteVideoElement(pubkey: string, type: 'video' | 'screen'): HTMLVideoElement {
    const elementsMap = type === 'video' ? this.remoteVideoElements : this.remoteScreenElements;
    const sourcesMap = type === 'video' ? this.remoteVideoSources : this.remoteScreenSources;

    let el = elementsMap.get(pubkey);
    if (el) return el;

    // Create video element
    el = document.createElement('video');
    el.autoplay = true;
    el.playsInline = true;
    el.muted = true; // video element is muted — audio comes via audio pipeline
    el.setAttribute('data-pubkey', pubkey);
    el.setAttribute('data-media-type', type);
    elementsMap.set(pubkey, el);

    // Set up MediaSource for chunk-based playback
    const ms = new MediaSource();
    const entry = { ms, sb: null as SourceBuffer | null, queue: [] as ArrayBuffer[] };
    sourcesMap.set(pubkey, entry);

    el.src = URL.createObjectURL(ms);

    ms.addEventListener('sourceopen', () => {
      try {
        const mimeType = 'video/webm;codecs=vp8';
        entry.sb = ms.addSourceBuffer(mimeType);
        entry.sb.mode = 'sequence';
        entry.sb.addEventListener('updateend', () => {
          // Flush queued chunks
          if (entry.queue.length > 0 && entry.sb && !entry.sb.updating) {
            const next = entry.queue.shift()!;
            entry.sb.appendBuffer(next);
          }
        });
        // Flush any chunks that arrived before sourceopen
        if (entry.queue.length > 0 && !entry.sb.updating) {
          const next = entry.queue.shift()!;
          entry.sb.appendBuffer(next);
        }
      } catch (err) {
        console.error('[voice] Failed to create SourceBuffer:', err);
      }
    });

    // Notify UI
    if (type === 'video') this.onRemoteVideoElement?.(pubkey, el);
    else this.onRemoteScreenElement?.(pubkey, el);

    return el;
  }

  private feedRemoteChunk(pubkey: string, data: ArrayBuffer, type: 'video' | 'screen'): void {
    const sourcesMap = type === 'video' ? this.remoteVideoSources : this.remoteScreenSources;

    // Ensure element exists
    this.ensureRemoteVideoElement(pubkey, type);

    const entry = sourcesMap.get(pubkey);
    if (!entry) return;

    if (entry.sb && !entry.sb.updating) {
      try {
        entry.sb.appendBuffer(data);
      } catch {
        // Buffer full or error — skip frame
      }
    } else {
      // Queue if SourceBuffer is busy or not ready yet
      entry.queue.push(data);
      // Keep queue bounded to prevent memory growth
      if (entry.queue.length > 30) entry.queue.shift();
    }
  }

  private cleanupRemoteMedia(pubkey: string, type: 'video' | 'screen'): void {
    const elementsMap = type === 'video' ? this.remoteVideoElements : this.remoteScreenElements;
    const sourcesMap = type === 'video' ? this.remoteVideoSources : this.remoteScreenSources;

    const el = elementsMap.get(pubkey);
    if (el) {
      el.pause();
      el.removeAttribute('src');
      el.load();
      elementsMap.delete(pubkey);
      if (type === 'video') this.onRemoteVideoElement?.(pubkey, null);
      else this.onRemoteScreenElement?.(pubkey, null);
    }

    const source = sourcesMap.get(pubkey);
    if (source) {
      if (source.ms.readyState === 'open') {
        try { source.ms.endOfStream(); } catch {}
      }
      sourcesMap.delete(pubkey);
    }
  }

  private cleanupAllRemoteMedia(): void {
    for (const pubkey of this.remoteVideoElements.keys()) {
      this.cleanupRemoteMedia(pubkey, 'video');
    }
    for (const pubkey of this.remoteScreenElements.keys()) {
      this.cleanupRemoteMedia(pubkey, 'screen');
    }
  }
}
