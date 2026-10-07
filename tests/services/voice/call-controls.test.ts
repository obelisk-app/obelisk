import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveVoiceClient } from '@/services/voice/active-client';
import type { VoiceClient } from '@/services/voice/client';
import {
  switchVoiceCamera, toggleVoiceCamera, toggleVoiceDeafen, toggleVoiceMic, toggleVoiceScreenShare,
} from '@/services/voice/call-controls';
import { useVoiceStore } from '@/store/voice';

function fakeClient() {
  return {
    setMicEnabled: vi.fn(async (_on: boolean) => {}),
    setDeafenEnabled: vi.fn((_on: boolean) => {}),
    setCameraEnabled: vi.fn(async (_on: boolean) => {}),
    setScreenShareEnabled: vi.fn(async (_on: boolean) => {}),
    switchCamera: vi.fn(async () => {}),
  };
}
let client: ReturnType<typeof fakeClient>;
const denied = () => Object.assign(new Error('denied'), { name: 'NotAllowedError' });

beforeEach(() => {
  client = fakeClient();
  setActiveVoiceClient(client as unknown as VoiceClient);
  useVoiceStore.setState({ error: null, isDeafened: false });
});
afterEach(() => {
  setActiveVoiceClient(null);
});

describe('call controls without an active client', () => {
  it('do nothing', async () => {
    setActiveVoiceClient(null);
    await toggleVoiceMic(true);
    await toggleVoiceDeafen(false, false);
    await toggleVoiceCamera(false);
    await switchVoiceCamera();
    await toggleVoiceScreenShare(false);
    expect(useVoiceStore.getState().isDeafened).toBe(false);
    expect(useVoiceStore.getState().error).toBeNull();
  });
});

describe('toggleVoiceMic', () => {
  it('turns the mic on when muted, off when not', async () => {
    await toggleVoiceMic(true);
    expect(client.setMicEnabled).toHaveBeenLastCalledWith(true);
    await toggleVoiceMic(false);
    expect(client.setMicEnabled).toHaveBeenLastCalledWith(false);
  });

  it('shows any failure, a denied mic included', async () => {
    client.setMicEnabled.mockRejectedValueOnce(new Error('broken'));
    await toggleVoiceMic(true);
    expect(useVoiceStore.getState().error).toBe('mic');
    client.setMicEnabled.mockRejectedValueOnce(denied());
    await toggleVoiceMic(true);
    expect(useVoiceStore.getState().error).toBe('permission');
  });
});

describe('toggleVoiceDeafen', () => {
  it('deafens the client and the store at once and stops an open mic', async () => {
    const done = toggleVoiceDeafen(false, false);
    expect(client.setDeafenEnabled).toHaveBeenCalledWith(true);
    expect(useVoiceStore.getState().isDeafened).toBe(true);
    expect(client.setMicEnabled).toHaveBeenCalledWith(false);
    await done;
  });

  it('leaves a muted mic, and undeafening, alone', async () => {
    await toggleVoiceDeafen(false, true);
    await toggleVoiceDeafen(true, false);
    expect(client.setDeafenEnabled).toHaveBeenLastCalledWith(false);
    expect(useVoiceStore.getState().isDeafened).toBe(false);
    expect(client.setMicEnabled).not.toHaveBeenCalled();
  });

  it('rejects with a mic that will not stop, after deafening', async () => {
    client.setMicEnabled.mockRejectedValueOnce(new Error('stuck'));
    await expect(toggleVoiceDeafen(false, false)).rejects.toThrow('stuck');
    expect(useVoiceStore.getState().isDeafened).toBe(true);
  });
});

describe('camera and screen toggles', () => {
  it('flip the current state', async () => {
    await toggleVoiceCamera(false);
    expect(client.setCameraEnabled).toHaveBeenLastCalledWith(true);
    await toggleVoiceCamera(true);
    expect(client.setCameraEnabled).toHaveBeenLastCalledWith(false);
    await toggleVoiceScreenShare(true);
    expect(client.setScreenShareEnabled).toHaveBeenLastCalledWith(false);
    await switchVoiceCamera();
    expect(client.switchCamera).toHaveBeenCalledTimes(1);
  });

  it('treat a declined prompt as an answer, not an error', async () => {
    client.setCameraEnabled.mockRejectedValueOnce(denied());
    client.setScreenShareEnabled.mockRejectedValueOnce(denied());
    client.switchCamera.mockRejectedValueOnce(denied());
    await toggleVoiceCamera(false);
    await toggleVoiceScreenShare(false);
    await switchVoiceCamera();
    expect(useVoiceStore.getState().error).toBeNull();
  });

  it('show any other failure under what the person was doing', async () => {
    client.setCameraEnabled.mockRejectedValueOnce(new Error('x'));
    await toggleVoiceCamera(false);
    expect(useVoiceStore.getState().error).toBe('camera');
    client.switchCamera.mockRejectedValueOnce(new Error('x'));
    await switchVoiceCamera();
    expect(useVoiceStore.getState().error).toBe('switchCamera');
    client.setScreenShareEnabled.mockRejectedValueOnce(new Error('x'));
    await toggleVoiceScreenShare(false);
    expect(useVoiceStore.getState().error).toBe('screen');
    client.setCameraEnabled.mockRejectedValueOnce(Object.assign(new Error('gone'), { name: 'NotFoundError' }));
    await toggleVoiceCamera(false);
    expect(useVoiceStore.getState().error).toBe('noDevice');
  });
});
