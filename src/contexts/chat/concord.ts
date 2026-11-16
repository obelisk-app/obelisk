import { createContext } from 'react';
import type { ConcordClient } from '@applesauce/concord/client';
import type { CommunityState } from '@applesauce/concord';
export const ConcordContext = createContext<{ client: ConcordClient | null; communities: CommunityState[]; error: string | null }>({ client: null, communities: [], error: null });
