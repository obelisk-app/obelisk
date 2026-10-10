import { describe, expect, it } from 'vitest';
import { OrderedMessageSnapshot } from '@/services/nostr-bridge/groups/message/ordered-snapshot';
import type { JsMessage } from '@/services/nostr-bridge/common/types';

const message = (id: string, createdAt: number, extra: Partial<JsMessage> = {}): JsMessage => ({
  id, createdAt, pubkey: 'author', content: 'body', kind: 9, replyToId: null, mentions: [], ...extra,
});

describe('ordered message snapshots', () => {
  it('preserves stable timestamp ties and replaces the first optimistic match in place', () => {
    const index = new OrderedMessageSnapshot();
    const pending = message('pending', 2, { pending: true, clientTag: 'send' });
    let rows = [message('first', 1), pending, message('tie', 2)];
    const echo = index.insert(rows, message('echo', 2));
    expect(echo.replacedClientTag).toBe('send');
    rows = echo.messages;
    expect(rows.map(m => m.id)).toEqual(['first', 'echo', 'tie']);
    rows = index.insert(rows, message('older', 0)).messages;
    rows = index.insert(rows, message('later-tie', 2)).messages;
    expect(rows.map(m => m.id)).toEqual(['older', 'first', 'echo', 'tie', 'later-tie']);
    expect(index.insert(rows, message('echo', 2)).messages).toBe(rows);
  });

  it('normalizes an unordered external snapshot on the next new event', () => {
    const index = new OrderedMessageSnapshot();
    const rows = [message('late', 3), message('early', 1)];
    expect(index.insert(rows, message('middle', 2)).messages.map(m => m.id)).toEqual(['early', 'middle', 'late']);
  });

  it('rebuilds after deletion, optimistic edits, reset, or restoring an old snapshot', () => {
    const index = new OrderedMessageSnapshot();
    const original = [message('a', 1)];
    index.insert(original, message('b', 2));
    expect(index.insert(original, message('b', 2)).messages).toHaveLength(2);
    expect(index.insert([], message('a', 1)).messages).toHaveLength(1);
    const pending = [message('p', 1, { pending: true, clientTag: 'send' })];
    index.insert(pending, message('z', 2));
    const failed = pending.map(m => ({ ...m, pending: false, failed: true }));
    expect(index.insert(failed, message('echo', 1)).messages).toHaveLength(2);
  });

  it('matches stable sort for a deterministic replay of duplicates, history and optimistic echoes', () => {
    const index = new OrderedMessageSnapshot();
    let actual = Array.from({ length: 10 }, (_, i) => message(`pending-${i}`, i, { pending: true, clientTag: `send-${i}` }));
    let expected = [...actual];
    for (let i = 0; i < 250; i++) {
      const event = message(`event-${i % 73}`, (i * 17) % 31);
      if (!expected.some(m => m.id === event.id)) {
        const pending = expected.findIndex(m => m.pending === true && m.pubkey === event.pubkey && m.content === event.content && m.createdAt === event.createdAt);
        expected = [...expected];
        if (pending >= 0) expected[pending] = event;
        else expected.push(event);
        expected.sort((a, b) => a.createdAt - b.createdAt);
      }
      actual = index.insert(actual, event).messages;
      expect(actual).toEqual(expected);
    }
  });

  for (const size of [100, 1000, 5000]) {
    it(`does not rescan ${size} confirmed rows for duplicate or append traffic`, () => {
      let reads = 0;
      const rows = Array.from({ length: size }, (_, i) => {
        const row = message(String(i), i);
        return new Proxy(row, { get(target, key, receiver) { reads++; return Reflect.get(target, key, receiver); } });
      });
      const index = new OrderedMessageSnapshot();
      const warmed = index.insert(rows, message('warm', size)).messages;
      reads = 0;
      expect(index.insert(warmed, message('0', 0)).messages).toBe(warmed);
      const next = index.insert(warmed, message('new', size + 1)).messages;
      expect(next).toHaveLength(size + 2);
      expect(reads).toBeLessThan(30);
    });
  }
});
