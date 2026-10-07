import { afterEach, describe, expect, it, vi } from 'vitest';

const publishAttack = vi.hoisted(() => vi.fn());
const publishCheckpoint = vi.hoisted(() => vi.fn());
const publishTopOut = vi.hoisted(() => vi.fn());
vi.mock('@/services/games/transport', () => ({ publishAttack, publishCheckpoint, publishTopOut }));

import { sendStackerAttack, sendStackerCheckpoint, sendStackerTopOut } from '@/services/games/stacker-relay';

const TABLE = { channelId: 'c1', id: 'g1' };
const CHECKPOINT = { frame: 600, attacksSent: 3, linesCleared: 9, stackHeight: 4, board: 'b64' };

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('stacker relay events', () => {
  it('publishes an attack, a checkpoint and a top-out for the table', () => {
    publishAttack.mockResolvedValue(undefined);
    publishCheckpoint.mockResolvedValue(undefined);
    publishTopOut.mockResolvedValue(undefined);
    sendStackerAttack(TABLE, 'seat-a', 'seat-b', 2, 5, 77);
    sendStackerCheckpoint(TABLE, 'seat-a', CHECKPOINT);
    sendStackerTopOut(TABLE, 'seat-a');
    expect(publishAttack).toHaveBeenCalledWith('c1', 'g1', { seat: 'seat-a', target: 'seat-b', lines: 2, hole: 5, nonce: 77 });
    expect(publishCheckpoint).toHaveBeenCalledWith('c1', 'g1', { seat: 'seat-a', ...CHECKPOINT });
    expect(publishTopOut).toHaveBeenCalledWith('c1', 'g1', 'seat-a');
  });

  it('logs a failed publish instead of throwing, so the board never stalls', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    publishAttack.mockRejectedValue(new Error('relay down'));
    publishCheckpoint.mockRejectedValue(new Error('relay down'));
    publishTopOut.mockRejectedValue(new Error('relay down'));
    expect(() => {
      sendStackerAttack(TABLE, 'a', 'b', 1, 0, 1);
      sendStackerCheckpoint(TABLE, 'a', CHECKPOINT);
      sendStackerTopOut(TABLE, 'a');
    }).not.toThrow();
    await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(3));
    expect(warn.mock.calls.map((c) => c[0])).toEqual([
      '[stacker] attack failed to publish',
      '[stacker] checkpoint failed to publish',
      '[stacker] topout failed to publish',
    ]);
  });
});
