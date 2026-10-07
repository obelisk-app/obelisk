import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { GameTypePreview } from '@/components/games/new-game/GamePreviews';

const renderLocalized = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('GameTypePreview', () => {
  it('draws Chain Reaction as a 4×5 grid with sixteen orbs', () => {
    const { container } = renderLocalized(<GameTypePreview type="chain-reaction" size={40} />);
    const svg = screen.getByRole('img');
    expect(svg).toHaveAttribute('width', '40');
    // The background plus one rect per cell.
    expect(container.querySelectorAll('rect')).toHaveLength(21);
    expect(container.querySelectorAll('circle')).toHaveLength(16);
  });

  it('draws Vesta as seven hexes with a road and two settlements', () => {
    const { container } = renderLocalized(<GameTypePreview type="vesta" />);
    expect(screen.getByRole('img')).toHaveAttribute('width', '56');
    expect(container.querySelectorAll('polygon')).toHaveLength(7);
    expect(container.querySelectorAll('line')).toHaveLength(1);
    expect(container.querySelectorAll('circle')).toHaveLength(2);
  });

  it('falls back to the catalog glyph, or a die, for any other game', () => {
    const { container, rerender } = renderLocalized(<GameTypePreview type="stacker" icon="🧱" size={30} />);
    expect(container.querySelector('svg')).toBeNull();
    expect(container).toHaveTextContent('🧱');
    expect((container.firstChild as HTMLElement).style.width).toBe('30px');
    rerender(<LocaleProvider initialLocale="en"><GameTypePreview type="unknown" /></LocaleProvider>);
    expect(container).toHaveTextContent('🎲');
  });
});
