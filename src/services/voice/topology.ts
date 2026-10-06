export type VoiceChannelKind = 'voice-sfu' | 'voice' | 'forum' | 'text' | null | undefined;
export type ActiveCallMode = 'sfu' | 'mesh' | null | undefined;

export function shouldUseSfuTopology(channelKind: VoiceChannelKind, activeCallMode: ActiveCallMode): boolean {
  return channelKind === 'voice-sfu' && activeCallMode !== 'mesh';
}
