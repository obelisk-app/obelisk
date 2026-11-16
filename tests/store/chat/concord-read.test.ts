import { afterEach, expect, it } from 'vitest';
import { useConcordReadStore } from '@/store/chat/concord-read';
import { parseConcordRead } from '@/schemas/chat/concord-read';
import { CONCORD_READ_BYTES } from '@/constants/chat/concord-read';

afterEach(() => useConcordReadStore.getState().reset(null));
it('bounds cursor documents below the encryption limit without evicting prior progress', () => {
  useConcordReadStore.getState().reset('account');
  const initial = 'concord:community:general';
  useConcordReadStore.getState().merge('account', { [initial]: 10 });
  const cursors = Object.fromEntries(Array.from({ length: 512 }, (_, n) => [`concord:${'a'.repeat(128)}:${String(n).padStart(128, 'b')}`, Date.now()]));
  useConcordReadStore.getState().merge('account', cursors);
  const value = JSON.stringify(useConcordReadStore.getState().cursors);
  expect(value.length).toBeLessThanOrEqual(CONCORD_READ_BYTES);
  expect(parseConcordRead(value)[initial]).toBe(10);
  expect(Object.keys(JSON.parse(value)).length).toBeLessThan(512);
});
