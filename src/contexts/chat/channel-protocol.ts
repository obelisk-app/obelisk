import { createContext } from 'react';
import type { ChannelProtocol } from '@/types/chat/channel-protocol';

export const ChannelProtocolContext = createContext<ChannelProtocol | null>(null);
