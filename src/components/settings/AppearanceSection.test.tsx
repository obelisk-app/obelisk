import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AppearanceSection from './AppearanceSection';
import { useAppearanceStore } from '@/store/appearance';

describe('AppearanceSection', () => {
  beforeEach(() => {
    useAppearanceStore.setState({ theme: 'lc-default', density: 'cozy', reducedMotion: false });
  });

  it('renders theme options and density radios', () => {
    render(<AppearanceSection />);
    expect(screen.getByTestId('theme-lc-default')).toBeInTheDocument();
    expect(screen.getByText('Cómoda')).toBeInTheDocument();
    expect(screen.getByText('Compacta')).toBeInTheDocument();
  });

  it('toggles reduced-motion switch', () => {
    render(<AppearanceSection />);
    const sw = screen.getByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(useAppearanceStore.getState().reducedMotion).toBe(true);
  });
});
