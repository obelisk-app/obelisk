import { describe, expect, it } from 'vitest';
import {
  KIND_CLIENT_AUTH,
  KIND_ENCRYPTED_DM,
  KIND_GROUP_CHAT_MESSAGE,
  KIND_GROUP_METADATA,
  KIND_NIP78_APP_DATA,
  KIND_RELAY_LIST,
} from '@/utils/nip-kinds';
import { eventKindDescription } from '@/services/nostr-bridge/kind-description';

describe('eventKindDescription', () => {
  it('codes the kinds the activity log shows (the indicators translate them)', () => {
    expect(eventKindDescription(KIND_CLIENT_AUTH)).toBe('relayAuth');
    expect(eventKindDescription(KIND_GROUP_CHAT_MESSAGE)).toBe('message');
    expect(eventKindDescription(KIND_ENCRYPTED_DM)).toBe('dm');
    expect(eventKindDescription(KIND_GROUP_METADATA)).toBe('groupMetadata');
    expect(eventKindDescription(KIND_NIP78_APP_DATA)).toBe('appData');
    expect(eventKindDescription(KIND_RELAY_LIST)).toBe('relayList');
  });

  it('falls back to a generic label', () => {
    expect(eventKindDescription(1)).toBe('event');
  });
});
