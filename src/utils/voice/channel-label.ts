/**
 * What the voice status bar calls the call's channel: its name when the
 * channel is known and named (an empty name stays empty), else the first
 * eight characters of its id and an ellipsis.
 */
export function voiceChannelLabel(groups: ReadonlyArray<{ id: string; name?: string | null }>, channelId: string): string {
  const group = groups.find((g) => g.id === channelId);
  return group?.name ?? `${channelId.slice(0, 8)}…`;
}
