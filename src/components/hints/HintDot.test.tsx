import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useHintsStore } from '@/store/hints';
import HintDot from './HintDot';

beforeEach(() => {
  window.localStorage.clear();
  useHintsStore.setState({ seen: [], muted: false });
});

describe('HintDot', () => {
  it('marks a control the reader has not met', () => {
    render(<HintDot hintId="rail-feed" />);
    expect(screen.getByTestId('hint-dot')).toBeInTheDocument();
  });

  it('disappears once the hint is seen', () => {
    useHintsStore.setState({ seen: ['rail-feed'] });
    render(<HintDot hintId="rail-feed" />);
    expect(screen.queryByTestId('hint-dot')).not.toBeInTheDocument();
  });

  it('disappears when hints are muted', () => {
    useHintsStore.setState({ muted: true });
    render(<HintDot hintId="rail-feed" />);
    expect(screen.queryByTestId('hint-dot')).not.toBeInTheDocument();
  });

  it('cannot swallow the click on the control it sits over', () => {
    render(<HintDot hintId="rail-feed" />);
    expect(screen.getByTestId('hint-dot').className).toContain('pointer-events-none');
  });

  it('says nothing to a screen reader — the callout carries the message', () => {
    render(<HintDot hintId="rail-feed" />);
    expect(screen.getByTestId('hint-dot')).toHaveAttribute('aria-hidden', 'true');
  });
});
