import { expect, it, vi } from 'vitest';
vi.mock('@nostr-wot/data', () => ({
  TextCoercingWebSocket: class extends EventTarget {
    constructor(..._args: unknown[]) { super(); }
    send(_data: unknown) {}
  },
}));
import { MeasuredRelayWebSocket, readRelayTraffic } from '@/services/nostr-bridge/relay/traffic';

it('counts socket directions and frame verbs without retaining identities or bodies', () => {
  const socket = new MeasuredRelayWebSocket('wss://relay.test/?token=secret');
  socket.send('["REQ","private-id",{"authors":["private-key"]}]');
  socket.send('["EVENT",{"content":"private-body"}]');
  socket.dispatchEvent(new MessageEvent('message', { data: '["OK","private-event-id",true,""]' }));
  socket.dispatchEvent(new Event('close'));
  const row = readRelayTraffic().at(-1)!;
  expect(row).toMatchObject({ relay: 'relay.test', closed: true, sent: 2, received: 1,
    frames: { 'send:REQ': 1, 'send:EVENT': 1, 'receive:OK': 1 } });
  expect(JSON.stringify(row)).not.toMatch(/secret|private-/);
  row.frames['send:REQ'] = 100;
  expect(readRelayTraffic().at(-1)?.frames['send:REQ']).toBe(1);
});
