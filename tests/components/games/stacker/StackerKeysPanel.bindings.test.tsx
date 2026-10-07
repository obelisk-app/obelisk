import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StackerKeysPanel from '@/components/games/stacker/StackerKeysPanel';
import { loadKeyMap } from '@/lib/games/stacker/keymap';
import { LocaleProvider } from '@tests/support/intl';

/**
 * Rebinding the controls: listen for a key, bind it, unbind one, reset.
 * Written against the panel before it moved onto the markup-only rule.
 */

const renderPanel = () => render(
  <LocaleProvider initialLocale="en"><StackerKeysPanel onClose={vi.fn()} /></LocaleProvider>,
);

const row = (action: string) => screen.getByTestId(`bind-${action}`).closest('li') as HTMLElement;
const press = (code: string) => act(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
});

afterEach(() => localStorage.clear());

describe('StackerKeysPanel bindings', () => {
  it('lists every action with its default keys, the space bar worded', () => {
    renderPanel();
    expect(within(row('left')).getByText('←')).toBeInTheDocument();
    expect(within(row('cw')).getByText('↑')).toBeInTheDocument();
    expect(within(row('cw')).getByText('X')).toBeInTheDocument();
    expect(within(row('hard')).getByText('Space')).toBeInTheDocument();
    expect(screen.getByTestId('stacker-key-list').querySelectorAll('li')).toHaveLength(8);
  });

  it('listens for the next key and binds it, keeping the action\'s other keys', () => {
    renderPanel();
    const bind = screen.getByTestId('bind-left');
    expect(bind).toHaveTextContent('+ key');
    fireEvent.click(bind);
    expect(bind).toHaveTextContent('press a key…');
    expect(bind).toHaveAttribute('aria-pressed', 'true');
    press('KeyQ');
    expect(bind).toHaveTextContent('+ key');
    expect(within(row('left')).getByText('Q')).toBeInTheDocument();
    expect(within(row('left')).getByText('←')).toBeInTheDocument();
    expect(loadKeyMap().KeyQ).toBe('left');
  });

  it('moves a key that already did something else', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('bind-left'));
    press('KeyX');
    expect(within(row('left')).getByText('X')).toBeInTheDocument();
    expect(within(row('cw')).queryByText('X')).not.toBeInTheDocument();
  });

  it('stops listening on Escape without binding it', () => {
    renderPanel();
    fireEvent.click(screen.getByTestId('bind-hold'));
    press('Escape');
    expect(screen.getByTestId('bind-hold')).toHaveTextContent('+ key');
    expect(loadKeyMap().Escape).toBeUndefined();
  });

  it('ignores keys while not listening', () => {
    renderPanel();
    press('KeyQ');
    expect(loadKeyMap().KeyQ).toBeUndefined();
  });

  it('unbinds a key when it is clicked, and saves that', () => {
    renderPanel();
    fireEvent.click(within(row('cw')).getByText('X'));
    expect(within(row('cw')).queryByText('X')).not.toBeInTheDocument();
    expect(loadKeyMap().KeyX).toBeUndefined();
    expect(within(row('cw')).getByText('↑')).toHaveAttribute('title', 'Remove this key');
  });

  it('resets to the defaults', () => {
    renderPanel();
    fireEvent.click(within(row('cw')).getByText('X'));
    fireEvent.click(screen.getByTestId('stacker-keys-reset'));
    expect(within(row('cw')).getByText('X')).toBeInTheDocument();
    expect(loadKeyMap().KeyX).toBe('cw');
  });
});
