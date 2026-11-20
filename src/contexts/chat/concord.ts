import { createContext } from 'react';
import type { ConcordClient } from '@applesauce/concord/client';
import type { BlobPointer, CommunityState } from '@applesauce/concord';
export const ConcordContext = createContext<{ client: ConcordClient | null; communities: CommunityState[]; error: string | null; loadArtwork?: (pointer: BlobPointer) => Promise<Blob> }>({ client: null, communities: [], error: null });
