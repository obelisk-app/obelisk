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
  it('dismisses from the close icon without running the toast action', () => {
    const onClick = vi.fn();
    act(() => { useToastStore.getState().pushToast({ title: 'Saved', body: 'Profile updated', onClick }); });
    renderStack();
    const dismiss = screen.getByTestId('toast-dismiss');
    expect(dismiss.querySelector('svg')).not.toBeNull();
    expect(dismiss.textContent).toBe('');
    fireEvent.click(dismiss);
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
