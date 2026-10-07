'use client';

import { lazy, Suspense, type ComponentProps } from 'react';
import type VestaTableComponent from '../vesta/VestaTable';
import type StackerTableComponent from '../stacker/StackerTable';

/**
 * The Vesta and Stacker tables, each fetched when a table of that game is
 * opened. They carry their game's rules and board code, so with static
 * imports opening a Chain Reaction table downloaded Vesta and Stacker too.
 * (The engine itself usually arrived already, when the chat card replayed
 * the table; see `src/lib/games/core/registry.ts`.)
 */

const VestaTable = lazy(() => import('../vesta/VestaTable'));
const StackerTable = lazy(() => import('../stacker/StackerTable'));

/** The same skeleton the modal shows while it loads the table's log. */
function TableLoading() {
  return <div className="lc-skeleton h-64 w-full rounded-lg" data-testid="game-table-loading" />;
}

export function LazyVestaTable(props: ComponentProps<typeof VestaTableComponent>) {
  return (
    <Suspense fallback={<TableLoading />}>
      <VestaTable {...props} />
    </Suspense>
  );
}

export function LazyStackerTable(props: ComponentProps<typeof StackerTableComponent>) {
  return (
    <Suspense fallback={<TableLoading />}>
      <StackerTable {...props} />
    </Suspense>
  );
}
