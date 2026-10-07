import { describe, expect, it } from 'vitest';
import { translator } from '@tests/support/intl';
import { connectionLabel, relayStatus } from '@/utils/relay/relay-status';

const en = translator('en');
const pt = translator('pt');

describe('relayStatus', () => {
  it('lets the connection state win over relay access', () => {
    const status = relayStatus('Connecting', 'restricted', 'nsec', 'relay.example', en);
    expect(status).toMatchObject({ state: 'connecting', label: 'Connecting to relay.example…', spinner: true });
  });

  it('passes a socket error through as the detail', () => {
    const status = relayStatus('Error: refused', 'ok', 'nsec', 'relay.example', en);
    expect(status).toMatchObject({ state: 'error', label: 'Cannot reach relay.example', detail: 'refused' });
  });

  it('reads an error code from the bridge in the reader\'s language, not as a raw code', () => {
    expect(relayStatus('Error:no-relays-connected', 'ok', 'nsec', 'relay.example', en)?.detail).toBe('Could not connect to any relay.');
    expect(connectionLabel('Error:no-relays-connected', pt)).toContain('Não foi possível conectar a nenhum relay.');
  });

  it('asks a signer user to reapprove and a local key user to reload', () => {
    expect(relayStatus('Connected', 'auth-required', 'nip07', 'h', en)?.detail).toMatch(/Reapprove/);
    expect(relayStatus('Connected', 'auth-required', 'nsec', 'h', en)?.detail).toMatch(/Try reloading/);
  });

  it('says nothing when the relay is fine', () => {
    expect(relayStatus('Connected', 'ok', 'nsec', 'h', en)).toBeNull();
    expect(relayStatus('Connected', 'unknown', 'nsec', 'h', en)).toBeNull();
  });

  it('translates with the host as an argument', () => {
    expect(relayStatus('Connected', 'error', 'bunker', 'relay.example', pt)?.label).toBe('Erro do relay em relay.example');
  });
});

describe('connectionLabel', () => {
  it('names each bridge state, and keeps the socket text of an error', () => {
    expect(connectionLabel('Connected', pt)).toBe('Conectado');
    expect(connectionLabel('Offline', en)).toBe('Offline');
    expect(connectionLabel('Disconnected', en)).toBe('Disconnected');
    expect(connectionLabel('Error: timeout', pt)).toBe('Erro: timeout');
  });
});
