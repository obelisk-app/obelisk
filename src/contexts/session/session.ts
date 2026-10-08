'use client';

import { createContext } from 'react';
import type { SessionController } from '@/types/session/session';

/** The value stays stable while session/profile snapshots change. */
export const SessionContext = createContext<SessionController | null>(null);
