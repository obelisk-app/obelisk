/** Only routing identifiers, never invitation capabilities or encryption keys. */
export function parseConcordLocation(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const communityId = params.get('concord');
  const channelId = params.get('channel');
  const threadId = params.get('thread');
  if (threadId && !/^[0-9a-f]{64}$/.test(threadId)) return null;
  if (!communityId || !/^[a-zA-Z0-9_-]{1,256}$/.test(communityId)) return null;
  if (channelId && !/^[a-zA-Z0-9_-]{1,256}$/.test(channelId)) return null;
  return { communityId, channelId: channelId || null, threadId: threadId || null };
}
