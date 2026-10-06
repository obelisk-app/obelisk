import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { useMutedLabel } from '@/hooks/chat/useMutedLabel';
import { MUTED_FOREVER } from '@/store/channel-prefs';
import { formatDateTime } from '@/utils/format/format';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LocaleProvider initialLocale="en">{children}</LocaleProvider>
);

describe('useMutedLabel', () => {
  it('is null when the channel is not muted', () => {
    const { result } = renderHook(() => useMutedLabel(undefined), { wrapper });
    expect(result.current).toBeNull();
  });

  it('names the sentinel as muted until turned back on', () => {
    const { result } = renderHook(() => useMutedLabel(MUTED_FOREVER), { wrapper });
    expect(result.current).toMatch(/until/i);
    expect(result.current).not.toContain('{time}');
  });

  it('formats a deadline in the current locale with hour, minute, day and short month', () => {
    const until = new Date('2026-10-05T14:30:00Z').getTime();
    const { result } = renderHook(() => useMutedLabel(until), { wrapper });
    const time = formatDateTime('en', until, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
    expect(result.current).toContain(time);
    expect(result.current).not.toContain('{time}');
  });
});
