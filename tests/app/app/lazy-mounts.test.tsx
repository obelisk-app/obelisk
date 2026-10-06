import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildImportGraph, staticClosure, staticPath } from '@tests/support/import-graph';

/**
 * Voice, games and DM calls are loaded on demand (`src/app/app/lazy-mounts.tsx`).
 * The first half reads the import graph: if a shell imports one of these
 * modules directly again, it lands back in the shell's own download and
 * every user pays for it on first load. The second half checks the game
 * table really is not fetched until a game is opened.
 */

const loads = vi.hoisted(() => ({ gameModal: 0 }));
vi.mock('@/components/chat/games/GameModal', () => {
  loads.gameModal += 1;
  return { GameModalHost: () => <div data-testid="game-modal-host" /> };
});

import { LazyGameModalHost } from '@/app/app/lazy-mounts';
import { useGamesStore } from '@/store/games';
import { LocaleProvider } from '@/i18n/context';

const SHELLS = [
  'src/app/app/DesktopShell.tsx',
  'src/app/app/mobile/PhoneShell.tsx',
];

const ON_DEMAND = [
  'src/components/voice/VoiceRoom.tsx',
  'src/components/chat/games/GameModal.tsx',
  'src/components/chat/games/NewGameModal.tsx',
  'src/components/call/DmCallLayer.tsx',
  'pkg:mediasoup-client',
];

describe('heavy features stay out of the shell download', () => {
  const graph = buildImportGraph();

  it.each(SHELLS)('%s reaches none of them through a static import', (shell) => {
    const closure = staticClosure(graph, shell);
    expect(closure.size).toBeGreaterThan(50);
    const leaks = ON_DEMAND.filter((m) => closure.has(m)).map((m) => staticPath(graph, shell, m)!.join(' -> '));
    expect(leaks).toEqual([]);
  });

  it('the voice page loads the room on demand too', () => {
    const page = 'src/app/voice/[channelId]/page.tsx';
    expect(staticClosure(graph, page).has('src/components/voice/VoiceRoom.tsx')).toBe(false);
  });

  it('every on-demand module is still reachable, through a dynamic import', () => {
    const dynamicTargets = new Set(graph.dynamicEdges.get('src/app/app/lazy-mounts.tsx'));
    for (const m of ON_DEMAND.filter((x) => !x.startsWith('pkg:'))) expect(dynamicTargets).toContain(m);
  });
});

describe('LazyGameModalHost', () => {
  afterEach(() => {
    act(() => useGamesStore.getState().setOpenGame(null));
  });

  it('does not fetch the game table until a game is opened, then shows a placeholder until it lands', async () => {
    render(<LocaleProvider initialLocale="en"><LazyGameModalHost /></LocaleProvider>);
    expect(screen.queryByTestId('lazy-modal-loading')).toBeNull();
    expect(loads.gameModal).toBe(0);

    act(() => useGamesStore.getState().setOpenGame('table-1'));
    expect(screen.getByTestId('lazy-modal-loading')).toBeInTheDocument();

    expect(await screen.findByTestId('game-modal-host')).toBeInTheDocument();
    expect(screen.queryByTestId('lazy-modal-loading')).toBeNull();
    expect(loads.gameModal).toBe(1);
  });
});
