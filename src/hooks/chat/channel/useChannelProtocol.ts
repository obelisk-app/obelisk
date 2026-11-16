import { useContext } from 'react';
import { ChannelProtocolContext } from '@/contexts/chat/channel-protocol';

export function useChannelProtocol() { return useContext(ChannelProtocolContext); }
