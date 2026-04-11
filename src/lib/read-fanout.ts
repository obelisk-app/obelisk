/**
 * Server-side helper for fanning a read-state update out to every OTHER
 * socket belonging to the same user. Used by both `mark-read` (channels)
 * and `dm-read` (direct messages) in `server.ts` so that reading in one
 * tab / device clears the badge on the user's other tabs / devices
 * instantly (scenario 11).
 *
 * Extracted as a pure helper so it is unit-testable without spinning up
 * an actual Socket.io server.
 */
export function fanOutReadUpdate(
  pubkeySockets: Map<string, Set<string>>,
  pubkey: string,
  senderSocketId: string,
  event: string,
  payload: unknown,
  emit: (socketId: string, event: string, payload: unknown) => void,
): number {
  const siblingIds = pubkeySockets.get(pubkey);
  if (!siblingIds) return 0;
  let count = 0;
  for (const sid of siblingIds) {
    if (sid === senderSocketId) continue;
    emit(sid, event, payload);
    count++;
  }
  return count;
}
