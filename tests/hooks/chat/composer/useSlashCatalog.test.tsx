import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/relay/useBotCommands', () => ({ useBotCommands: () => [] }));
import { useSlashCatalog } from '@/hooks/chat/composer/useSlashCatalog';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

const wrapper = bridgeWrapper(fakeBridge());

describe('useSlashCatalog', () => {
  it('is empty while the picker is closed', () => {
    const { result } = renderHook(() => useSlashCatalog('wss://r', null, {}), { wrapper });
    expect(result.current.slashSections).toEqual([]);
    expect(result.current.slashRail).toEqual([]);
    expect(result.current.slashResults).toEqual([]);
  });

  it('lists the built-ins for a matching query and fills the rail', () => {
    const { result } = renderHook(() => useSlashCatalog('wss://r', 'za', {}), { wrapper });
    expect(result.current.slashResults.map((c) => c.name)).toContain('zap');
    expect(result.current.slashRail.length).toBeGreaterThan(0);
    expect(result.current.slashFilter).toBe('all');
    expect(result.current.botProfiles).toEqual({});
  });
});
