import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { useVoiceRoomScreen } from '@/hooks/shell/mobile/screens/voice/useVoiceRoomScreen';
import { group } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

const call = (status: string) => ({ g1: { hostPubkey: 'h'.repeat(64), status, participantCount: 1, expiresAt: 0, createdAt: 0 } });
const run = (seed: Parameters<typeof fakeBridge>[0]) =>
  renderHook(() => useVoiceRoomScreen('g1'), { wrapper: bridgeWrapper(fakeBridge(seed)) }).result.current;

describe('useVoiceRoomScreen', () => {
  it('finds the channel and says whether it is an SFU room', () => {
    expect(run({ groups: [group({ id: 'g1', kind: 'voice-sfu', name: 'Big' })] })).toMatchObject({ isSfu: true, group: { name: 'Big' } });
    expect(run({ groups: [group({ id: 'g1', kind: 'voice' })] }).isSfu).toBe(false);
    expect(run({}).group).toBeNull();
  });

  it('has no status line without a call', () => {
    expect(run({}).sub).toBeNull();
  });

  it('translates the known statuses and passes an unknown one through', () => {
    expect(run({ activeCallByChannel: call('connected') }).sub).toBe('Live · connected');
    expect(run({ activeCallByChannel: call('starting') }).sub).toBe('Starting…');
    expect(run({ activeCallByChannel: call('active') }).sub).toBe('Live');
    expect(run({ activeCallByChannel: call('mystery') }).sub).toBe('mystery');
  });
});
