import { describe, expect, it } from 'vitest';
import {
  VoiceError,
  isVoiceErrorCode,
  mediaDeviceProblem,
  voiceErrorCode,
} from '@/utils/voice/errors';
import { VOICE_ERROR_CODES } from '@/constants/voice/errors';
import { readModule } from '@tests/support/messages';
import { CodedError } from '@/utils/errors/codes';

describe('voice error codes', () => {
  it('every code has an English message, and every message has a code', () => {
    const messages = readModule('en', 'voice').error as Record<string, string>;
    expect(Object.keys(messages).sort()).toEqual([...VOICE_ERROR_CODES].sort());
  });

  it('tells a code from free text', () => {
    expect(isVoiceErrorCode('cameraLimit')).toBe(true);
    expect(isVoiceErrorCode('Camera limit reached')).toBe(false);
    expect(isVoiceErrorCode(null)).toBe(false);
  });

  it('keeps a VoiceError code and its English detail apart', () => {
    const err = new VoiceError('roomFull', 'Room is full.');
    expect(err.code).toBe('roomFull');
    expect(err.message).toBe('Room is full.');
    expect(voiceErrorCode(err, 'join')).toBe('roomFull');
  });

  it('names a media-device problem by its DOMException name', () => {
    const named = (name: string) => Object.assign(new Error('browser wording'), { name });
    expect(mediaDeviceProblem(named('NotAllowedError'))).toBe('permission');
    expect(mediaDeviceProblem(named('NotFoundError'))).toBe('noDevice');
    expect(mediaDeviceProblem(named('NotReadableError'))).toBe('deviceBusy');
    expect(mediaDeviceProblem(named('TypeError'))).toBeNull();
    expect(mediaDeviceProblem(undefined)).toBeNull();
    expect(voiceErrorCode(named('NotReadableError'), 'camera')).toBe('deviceBusy');
  });

  it('reads a relay refusal by its NIP-01 prefix, and falls back to what the user was doing', () => {
    expect(voiceErrorCode(new Error('Relay rejected event: restricted: Access denied'), 'join')).toBe('relayRefused');
    expect(voiceErrorCode(new Error('auth-required: please authenticate'), 'join')).toBe('relayRefused');
    expect(voiceErrorCode(new Error('rpc timeout: produce'), 'screen')).toBe('screen');
    expect(voiceErrorCode('not an error', 'mic')).toBe('mic');
  });

  it('reads a bridge error code that has a voice counterpart', () => {
    expect(voiceErrorCode(new CodedError('not-logged-in', 'Not logged in'), 'join')).toBe('notLoggedIn');
    expect(voiceErrorCode(new CodedError('not-whitelisted', 'not on the list'), 'join')).toBe('relayRefused');
    expect(voiceErrorCode(new CodedError('signer-timeout', 'signer timed out'), 'join')).toBe('join');
  });
});
