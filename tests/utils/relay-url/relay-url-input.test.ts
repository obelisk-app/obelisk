import { describe, expect, it } from 'vitest';
import { normalizeRelayInput } from '@/utils/relay-url/relay-url-input';

describe('normalizeRelayInput', () => {
  it('prefixes wss:// when no scheme was typed, stripping leading slashes', () => {
    expect(normalizeRelayInput('relay.example')).toBe('wss://relay.example');
    expect(normalizeRelayInput('//relay.example')).toBe('wss://relay.example');
    expect(normalizeRelayInput('  relay.example/path  ')).toBe('wss://relay.example/path');
  });

  it('keeps an explicit ws:// or wss:// as typed', () => {
    expect(normalizeRelayInput('ws://localhost:7777')).toBe('ws://localhost:7777');
    expect(normalizeRelayInput('wss://relay.example')).toBe('wss://relay.example');
  });

  it('returns null for an empty or unparseable address', () => {
    expect(normalizeRelayInput('')).toBeNull();
    expect(normalizeRelayInput('   ')).toBeNull();
    expect(normalizeRelayInput('wss://')).toBeNull();
  });
});
