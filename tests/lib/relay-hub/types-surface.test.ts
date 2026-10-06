/**
 * `types.ts` stays the one import for the hub's types after the transport
 * seams and the configuration moved to their own files. Checked by the type
 * checker (`tsc --noEmit` covers tests/), so a dropped re-export fails it.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type * as Types from '@/lib/relay-hub/types';
import type * as Transport from '@/lib/relay-hub/transport-types';
import type * as Config from '@/lib/relay-hub/config-types';

describe('relay-hub types surface', () => {
  it('re-exports every transport seam and configuration type unchanged', () => {
    expectTypeOf<Types.RelayLike>().toEqualTypeOf<Transport.RelayLike>();
    expectTypeOf<Types.RelayFactory>().toEqualTypeOf<Transport.RelayFactory>();
    expectTypeOf<Types.SimplePoolLike>().toEqualTypeOf<Transport.SimplePoolLike>();
    expectTypeOf<Types.PoolLike>().toEqualTypeOf<Transport.PoolLike>();
    expectTypeOf<Types.PoolSubscribeParams>().toEqualTypeOf<Transport.PoolSubscribeParams>();
    expectTypeOf<Types.SubscriptionLike>().toEqualTypeOf<Transport.SubscriptionLike>();
    expectTypeOf<Types.HubEnv>().toEqualTypeOf<Config.HubEnv>();
    expectTypeOf<Types.RelayHubOptions>().toEqualTypeOf<Config.RelayHubOptions>();
    expectTypeOf<Types.BackoffPolicy>().toEqualTypeOf<Config.BackoffPolicy>();
  });
});
