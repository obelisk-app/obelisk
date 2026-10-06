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
  it('names the kinds the activity log shows', () => {
    expect(eventKindDescription(KIND_CLIENT_AUTH)).toBe('NIP-42 relay auth');
    expect(eventKindDescription(KIND_GROUP_CHAT_MESSAGE)).toBe('Send message');
    expect(eventKindDescription(KIND_ENCRYPTED_DM)).toBe('Direct message');
    expect(eventKindDescription(KIND_GROUP_METADATA)).toBe('Group metadata');
    expect(eventKindDescription(KIND_NIP78_APP_DATA)).toBe('App data');
    expect(eventKindDescription(KIND_RELAY_LIST)).toBe('Relay list');
  });

  it('falls back to a generic label', () => {
    expect(eventKindDescription(1)).toBe('Nostr event');
  });
});
