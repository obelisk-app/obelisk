import { describe, expect, it } from 'vitest';
import type { RelayStatus } from '@/services/social/relay-status';
import { relayLatencyLabel, relayStatusRows } from '@/utils/social/relay-status-rows';
import { RELAY_STATE_DOT } from '@/constants/social/relay-status-rows';

const status = (url: string, patch: Partial<RelayStatus> = {}): RelayStatus => ({
  url, state: 'connected', latencyMs: null, notes: 0, lastChange: 0, ...patch,
});

describe('relayStatusRows', () => {
  it('keeps the configured order and spelling, matching statuses by normalized url', () => {
    const rows = relayStatusRows(
      ['wss://a.example/', 'wss://b.example'],
      { 'wss://a.example': status('wss://a.example', { state: 'failed' }) },
    );
    expect(rows.map((r) => r.relay)).toEqual(['wss://a.example/', 'wss://b.example']);
    expect(rows[0].state).toBe('failed');
    expect(rows[0].status?.url).toBe('wss://a.example');
  });

  it('reports a relay with no status yet as unknown', () => {
    const [row] = relayStatusRows(['wss://c.example'], {});
    expect(row).toEqual({ relay: 'wss://c.example', status: undefined, state: 'unknown' });
  });

  it('treats an unparseable url as unknown rather than throwing', () => {
    expect(relayStatusRows(['not a relay'], {})[0].state).toBe('unknown');
  });
});

describe('relayLatencyLabel', () => {
  it('prints a measured latency and nothing otherwise', () => {
    expect(relayLatencyLabel(status('x', { latencyMs: 120 }))).toBe('120ms');
    expect(relayLatencyLabel(status('x', { latencyMs: 0 }))).toBe('0ms');
    expect(relayLatencyLabel(status('x'))).toBe('');
    expect(relayLatencyLabel(undefined)).toBe('');
  });
});

describe('RELAY_STATE_DOT', () => {
  it('has a colour for every state', () => {
    expect(Object.keys(RELAY_STATE_DOT).sort()).toEqual(['connected', 'connecting', 'failed', 'offline', 'unknown']);
  });
});
