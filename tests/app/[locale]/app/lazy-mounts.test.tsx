import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildImportGraph, staticClosure, staticPath } from '@tests/support/import-graph';

/**
 * Voice, games and DM calls are loaded on demand (`src/app/[locale]/app/lazy-mounts.tsx`),
 * and so are the DM call session (`services/dm-call/load-session.ts`) and each
 * game's rules engine (`lib/games/registry.ts`). The first half reads the
 * import graph: if a shell imports one of these modules directly again, it
 * lands back in the shell's own download and every user pays for it on first
 * load. The second half checks the game table really is not fetched until a
 * game is opened.
 */

const loads = vi.hoisted(() => ({ gameModal: 0 }));
vi.mock('@/components/chat/games/GameModal', () => {
  loads.gameModal += 1;
  return { GameModalHost: () => <div data-testid="game-modal-host" /> };
});

import { LazyGameModalHost } from '@/app/[locale]/app/lazy-mounts';
import { useGamesStore } from '@/store/games';
import { LocaleProvider } from '@tests/support/intl';

/** What the first load of `/app` (route, then a shell) and of `/` runs. */
const SHELLS = [
  'src/app/[locale]/app/DesktopShell.tsx',
  'src/app/[locale]/app/mobile/PhoneShell.tsx',
  'src/app/[locale]/app/AppGate.tsx',
  'src/app/[locale]/page.tsx',
];

const ON_DEMAND = [
  'src/components/voice/VoiceRoom.tsx',
  'src/components/chat/games/GameModal.tsx',
  'src/components/chat/games/NewGameModal.tsx',
  'src/components/call/DmCallLayer.tsx',
  'pkg:mediasoup-client',
  // The DM call's media stack: fetched when a call starts or rings.
  'src/services/dm-call/session.ts',
  'pkg:simple-peer',
  // Rules engines: fetched when a table of that game is read.
  'src/lib/games/chain-reaction.ts',
  'src/lib/games/vesta/definition.ts',
  'pkg:vesta',
  'src/lib/games/stacker/definition.ts',
  'src/lib/games/stacker/engine.ts',
  'src/lib/games/stacker/match.ts',
];

/** Who fetches each on-demand module, through `import()`. */
const LOADED_BY: Record<string, string> = {
  'src/components/voice/VoiceRoom.tsx': 'src/app/[locale]/app/lazy-mounts.tsx',
  'src/components/chat/games/GameModal.tsx': 'src/app/[locale]/app/lazy-mounts.tsx',
  'src/components/chat/games/NewGameModal.tsx': 'src/app/[locale]/app/lazy-mounts.tsx',
  'src/components/call/DmCallLayer.tsx': 'src/app/[locale]/app/lazy-mounts.tsx',
  'src/services/dm-call/session.ts': 'src/services/dm-call/load-session.ts',
  'src/lib/games/chain-reaction.ts': 'src/lib/games/registry.ts',
  'src/lib/games/vesta/definition.ts': 'src/lib/games/registry.ts',
  'src/lib/games/stacker/definition.ts': 'src/lib/games/registry.ts',
};

describe('heavy features stay out of the shell download', () => {
  const graph = buildImportGraph();

  it.each(SHELLS)('%s reaches none of them through a static import', (shell) => {
    const closure = staticClosure(graph, shell);
    expect(closure.size).toBeGreaterThan(50);
    const leaks = ON_DEMAND.filter((m) => closure.has(m)).map((m) => staticPath(graph, shell, m)!.join(' -> '));
    expect(leaks).toEqual([]);
  });

  it('the voice page loads the room on demand too', () => {
    const page = 'src/app/[locale]/voice/[channelId]/page.tsx';
    expect(staticClosure(graph, page).has('src/components/voice/VoiceRoom.tsx')).toBe(false);
  });

  it('every on-demand module is still reachable, through a dynamic import', () => {
    for (const [target, loader] of Object.entries(LOADED_BY)) {
      expect(graph.dynamicEdges.get(loader), `${loader} -> import('${target}')`).toContain(target);
    }
  });

  it('a game table brings only its own game: opening Chain Reaction fetches no Vesta or Stacker code', () => {
    const modal = 'src/components/chat/games/GameModal.tsx';
    const closure = staticClosure(graph, modal);
    const others = [
      'src/components/chat/games/vesta/VestaTable.tsx',
      'src/components/chat/games/stacker/StackerTable.tsx',
      'src/lib/games/vesta/definition.ts',
      'pkg:vesta',
      'src/lib/games/stacker/engine.ts',
    ];
    expect(others.filter((m) => closure.has(m)).map((m) => staticPath(graph, modal, m)!.join(' -> '))).toEqual([]);
    const lazyTables = graph.dynamicEdges.get('src/components/chat/games/LazyTables.tsx');
    expect(lazyTables).toContain(others[0]);
    expect(lazyTables).toContain(others[1]);
  });

  it('the shells still reach the loaders, so the features are not simply gone', () => {
    const closure = staticClosure(graph, SHELLS[0]);
    for (const loader of new Set(Object.values(LOADED_BY))) expect(closure.has(loader), loader).toBe(true);
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
