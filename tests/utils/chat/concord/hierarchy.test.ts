import { expect, it } from 'vitest';
import type { ChannelMetadata } from '@applesauce/concord';
import { concordChannelParents, concordParentOptions } from '@/utils/chat/concord/channels';
const channel = (id: string, parent = '') => ({ channel_id: id, name: id, private: false, custom: { obelisk: { parent } } }) as ChannelMetadata;
it('keeps valid nested channels and treats cycles and missing parents as roots', () => {
  const channels = [channel('root'), channel('child', 'root'), channel('leaf', 'child'), channel('a', 'b'), channel('b', 'a'), channel('missing', 'unknown')];
  expect([...concordChannelParents(channels)]).toEqual([['child', 'root'], ['leaf', 'child']]);
  expect(concordParentOptions(channels, 'root').map(row => row.channel_id)).not.toContain('leaf');
});
