import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const loads = vi.hoisted(() => ({ vesta: 0, stacker: 0 }));
vi.mock('@/components/games/vesta/VestaTable', () => {
  loads.vesta++;
  return { default: () => <div data-testid="vesta-table" /> };
});
vi.mock('@/components/games/stacker/StackerTable', () => {
  loads.stacker++;
  return { default: () => <div data-testid="stacker-table" /> };
});

import { LazyStackerTable, LazyVestaTable } from '@/components/games/table/LazyTables';

type VestaProps = Parameters<typeof LazyVestaTable>[0];
type StackerProps = Parameters<typeof LazyStackerTable>[0];

describe('LazyTables', () => {
  it('fetches a game\'s table only when one is drawn, with a skeleton until it lands', async () => {
    expect(loads).toEqual({ vesta: 0, stacker: 0 });
    render(<LazyVestaTable {...({} as VestaProps)} />);
    expect(screen.getByTestId('game-table-loading')).toBeInTheDocument();
    expect(await screen.findByTestId('vesta-table')).toBeInTheDocument();
    expect(screen.queryByTestId('game-table-loading')).toBeNull();
    expect(loads).toEqual({ vesta: 1, stacker: 0 });

    render(<LazyStackerTable {...({} as StackerProps)} />);
    expect(await screen.findByTestId('stacker-table')).toBeInTheDocument();
    expect(loads).toEqual({ vesta: 1, stacker: 1 });
  });
});
