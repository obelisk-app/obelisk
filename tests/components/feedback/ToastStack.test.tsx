import userEvent from '@testing-library/user-event';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import ToastStack from '@/components/feedback/ToastStack';
import { useToastStore } from '@/store/feedback/toast';

const renderStack = () => render(<LocaleProvider initialLocale="en"><ToastStack /></LocaleProvider>);

beforeEach(() => {
  vi.useFakeTimers();
  useToastStore.getState().clearToasts();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('ToastStack', () => {
  it('keeps a polite live region mounted before feedback arrives', () => {
    renderStack();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    act(() => { useToastStore.getState().pushToast({ title: 'Saved', body: '' }); });
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('dismisses from the close icon without running the toast action', () => {
    const onClick = vi.fn();
    act(() => { useToastStore.getState().pushToast({ title: 'Saved', body: 'Profile updated', onClick }); });
    renderStack();
    const dismiss = screen.getByTestId('toast-dismiss');
    expect(dismiss.tagName).toBe('BUTTON');
    expect(dismiss.tabIndex).toBe(0);
    expect(dismiss.parentElement?.closest('button')).toBeNull();
    dismiss.focus();
    expect(dismiss).toHaveFocus();
    expect(dismiss.querySelector('svg')).not.toBeNull();
    expect(dismiss.textContent).toBe('');
    fireEvent.click(dismiss);
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('dismisses with the keyboard without activating the toast action', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const onClick = vi.fn();
    act(() => { useToastStore.getState().pushToast({ title: 'Saved', body: '', onClick }); });
    renderStack();
    screen.getByRole('button', { name: 'Dismiss' }).focus();
    await user.keyboard('{Enter}');
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('runs the action and closes when the toast itself is clicked', () => {
    const onClick = vi.fn();
    act(() => { useToastStore.getState().pushToast({ title: 'New DM', body: 'hi', onClick }); });
    renderStack();
    fireEvent.click(screen.getByTestId('toast'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('auto-dismisses after five seconds', () => {
    act(() => { useToastStore.getState().pushToast({ title: 'x', body: 'y' }); });
    renderStack();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});
