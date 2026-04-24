import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Capture the props passed to the vanilla emoji-mart Picker so we can verify
// the wrapper wires them up correctly. This guards against regressions from
// the @emoji-mart/react → vanilla emoji-mart migration: if the mount pattern
// ever breaks, these assertions fail before real users see a dead picker.
const pickerCalls: any[] = [];
vi.mock('emoji-mart', () => ({
  Picker: vi.fn(function MockPicker(this: any, props: any) {
    pickerCalls.push(props);
    const el = document.createElement('div');
    el.setAttribute('data-mock-picker', '');
    props.ref?.current?.appendChild(el);
  }),
}));

vi.mock('@emoji-mart/data', () => ({ default: { categories: [], emojis: {} } }));

import EmojiPicker from './EmojiPicker';

describe('EmojiPicker', () => {
  beforeEach(() => {
    pickerCalls.length = 0;
  });

  it('mounts the vanilla emoji-mart Picker into the DOM', () => {
    render(<EmojiPicker onSelect={() => {}} onClose={() => {}} />);

    expect(pickerCalls).toHaveLength(1);
    expect(screen.getByTestId('emoji-picker').querySelector('[data-mock-picker]')).toBeTruthy();
  });

  it('passes sensible defaults to the Picker', () => {
    render(<EmojiPicker onSelect={() => {}} onClose={() => {}} />);

    const props = pickerCalls[0];
    expect(props.theme).toBe('dark');
    expect(props.previewPosition).toBe('none');
    expect(props.skinTonePosition).toBe('search');
    expect(props.autoFocus).toBe(true);
    expect(props.data).toBeDefined();
    expect(typeof props.onEmojiSelect).toBe('function');
  });

  it('forwards unicode emoji selections as native chars', () => {
    const onSelect = vi.fn();
    render(<EmojiPicker onSelect={onSelect} onClose={() => {}} />);

    pickerCalls[0].onEmojiSelect({ native: '🎉', id: 'tada' });

    expect(onSelect).toHaveBeenCalledWith('🎉');
  });

  it('forwards custom (no-native) emoji selections as :name: shortcodes', () => {
    const onSelect = vi.fn();
    render(
      <EmojiPicker
        onSelect={onSelect}
        onClose={() => {}}
        serverEmojis={{ partyparrot: 'https://example.com/parrot.gif' }}
      />,
    );

    pickerCalls[0].onEmojiSelect({ id: 'partyparrot' });

    expect(onSelect).toHaveBeenCalledWith(':partyparrot:');
  });

  it('builds a Server custom category when serverEmojis are provided', () => {
    render(
      <EmojiPicker
        onSelect={() => {}}
        onClose={() => {}}
        serverEmojis={{ foo: 'https://example.com/foo.png' }}
      />,
    );

    const { custom } = pickerCalls[0];
    expect(custom).toHaveLength(1);
    expect(custom[0].id).toBe('server');
    expect(custom[0].emojis[0]).toMatchObject({
      id: 'foo',
      skins: [{ src: 'https://example.com/foo.png' }],
    });
  });

  it('omits custom categories when no serverEmojis are provided', () => {
    render(<EmojiPicker onSelect={() => {}} onClose={() => {}} />);
    expect(pickerCalls[0].custom).toBeUndefined();
  });

  it('calls onClose when clicking outside the picker', () => {
    const onClose = vi.fn();
    render(
      <div>
        <button data-testid="outside">outside</button>
        <EmojiPicker onSelect={() => {}} onClose={onClose} />
      </div>,
    );

    fireEvent.mouseDown(screen.getByTestId('outside'));

    expect(onClose).toHaveBeenCalled();
  });

  it('does not call onClose when clicking inside the picker', () => {
    const onClose = vi.fn();
    render(<EmojiPicker onSelect={() => {}} onClose={onClose} />);

    fireEvent.mouseDown(screen.getByTestId('emoji-picker'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not re-mount the Picker when onSelect identity changes between renders', () => {
    // Regression guard: consumers pass inline lambdas whose identity changes
    // every parent render. An earlier version kept onSelect in the mount
    // effect's deps, so the (expensive, shadow-DOM) Picker was torn down and
    // re-constructed on every re-render. The ref-latch pattern prevents this.
    const { rerender } = render(<EmojiPicker onSelect={() => {}} onClose={() => {}} />);
    expect(pickerCalls).toHaveLength(1);

    rerender(<EmojiPicker onSelect={() => 'fresh lambda'} onClose={() => {}} />);
    rerender(<EmojiPicker onSelect={() => 'another fresh lambda'} onClose={() => {}} />);

    expect(pickerCalls).toHaveLength(1);
  });

  it('routes late-bound onSelect calls through the latest callback', () => {
    // Companion to the no-remount guard above: since the Picker constructor
    // only runs once, its closed-over onEmojiSelect handler must dispatch
    // through a ref so the newest consumer callback actually wins.
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<EmojiPicker onSelect={first} onClose={() => {}} />);
    rerender(<EmojiPicker onSelect={second} onClose={() => {}} />);

    pickerCalls[0].onEmojiSelect({ native: '🔥' });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('🔥');
  });
});
