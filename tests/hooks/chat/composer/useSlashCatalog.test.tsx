import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/relay/useBotCommands', () => ({ useBotCommands: () => [] }));
vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({ getBridgeImpl: () => null });
});

import { useSlashCatalog } from '@/hooks/chat/composer/useSlashCatalog';

describe('useSlashCatalog', () => {
  it('is empty while the picker is closed', () => {
    const { result } = renderHook(() => useSlashCatalog('wss://r', null, {}));
    expect(result.current.slashSections).toEqual([]);
    expect(result.current.slashRail).toEqual([]);
    expect(result.current.slashResults).toEqual([]);
  });

  it('lists the built-ins for a matching query and fills the rail', () => {
    const { result } = renderHook(() => useSlashCatalog('wss://r', 'za', {}));
    expect(result.current.slashResults.map((c) => c.name)).toContain('zap');
    expect(result.current.slashRail.length).toBeGreaterThan(0);
    expect(result.current.slashFilter).toBe('all');
    expect(result.current.botProfiles).toEqual({});
  });
});
