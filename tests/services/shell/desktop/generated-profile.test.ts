import { afterEach, describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';
import { attachGeneratedProfileEnhancements } from '@/services/shell/desktop/generated-profile';
import type { Translate } from '@/i18n/keys';

const t = ((key: string) => key) as unknown as Translate;
const nsec = nip19.nsecEncode(new Uint8Array(32).fill(1));

function mountStep() {
  const overlay = document.createElement('div');
  overlay.className = 'nui-modal-overlay';
  overlay.innerHTML = `
    <div class="obelisk-login-modal">
      <div class="nui-key-display">${nsec}</div>
      <input placeholder="Satoshi" />
      <label><span>Picture URL</span><input type="url" placeholder="https://example.com/avatar.jpg" /></label>
    </div>`;
  document.body.append(overlay);
  return overlay;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('attachGeneratedProfileEnhancements', () => {
  it('enhances a step that is already open: a suggested name and the media pickers', () => {
    mountStep();
    const onDraftChange = vi.fn();
    const detach = attachGeneratedProfileEnhancements(t, onDraftChange);
    const name = document.querySelector<HTMLInputElement>('[data-obelisk-name]')!;
    expect(name.value).toBe('');
    expect(onDraftChange).toHaveBeenCalledWith({ name: name.placeholder });
    expect(document.querySelectorAll('.obelisk-media-picker')).toHaveLength(2);
    detach();
  });

  it('waits for the overlay to appear, then stops polling', () => {
    vi.useFakeTimers();
    const onDraftChange = vi.fn();
    const detach = attachGeneratedProfileEnhancements(t, onDraftChange);
    vi.advanceTimersByTime(300);
    expect(onDraftChange).not.toHaveBeenCalled();
    mountStep();
    vi.advanceTimersByTime(100);
    expect(onDraftChange).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    detach();
  });

  it('stops polling when detached before the overlay appears', () => {
    vi.useFakeTimers();
    const onDraftChange = vi.fn();
    attachGeneratedProfileEnhancements(t, onDraftChange)();
    mountStep();
    vi.advanceTimersByTime(500);
    expect(onDraftChange).not.toHaveBeenCalled();
  });
});
