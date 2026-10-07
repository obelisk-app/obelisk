import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { SearchScreen } from '@/app/[locale]/app/mobile/screens/search/SearchScreen';

vi.mock('@/services/relay/relay-info', async (orig) => ({
  ...(await orig<typeof import('@/services/relay/relay-info')>()),
  fetchRelayInfo: vi.fn().mockResolvedValue(null),
  supportsSearch: () => true,
}));

function mount() {
  const back = vi.fn();
  renderWithBridge(
    <SearchScreen back={back} selectGroup={vi.fn()} />,
    fakeBridge({}, { searchMessages: vi.fn().mockResolvedValue({ hits: [], partial: false }) } as never),
  );
  return { back, input: screen.getByRole('searchbox') as HTMLInputElement };
}

describe('SearchScreen (phone) keys and chips', () => {
  it('clears the query on Escape, and leaves on Escape when it is empty', () => {
    const { back, input } = mount();
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
    expect(back).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(back).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(back).toHaveBeenCalledTimes(1);
  });

  it('puts the focus back in the field after a chip adds its token', async () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame'] });
    try {
      const { input } = mount();
      input.blur();
      fireEvent.click(screen.getByTestId('mobile-search-chip-from'));
      expect(input.value).toContain('from:');
      await act(async () => { vi.advanceTimersToNextFrame(); });
      expect(document.activeElement).toBe(input);
    } finally {
      vi.useRealTimers();
    }
  });

  it('offers the mentions chip for the signed-in person', () => {
    const { input } = mount();
    fireEvent.click(screen.getByTestId('mobile-search-chip-mentions'));
    expect(input.value).toContain('mentions:');
  });
});
