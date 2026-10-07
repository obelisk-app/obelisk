import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PopoverPanel, { type PopoverDismiss, type PopoverFollow, type PopoverSurface } from '@/components/ui/overlays/PopoverPanel';
import { MENU_PANEL_CLASS } from '@/components/ui/overlays/menu';

const rect = (top: number, height: number, left = 900, width = 32) =>
  ({ top, bottom: top + height, left, right: left + width, width, height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;

let anchorTop = 400;

function Host({ follow = 'close', surface = 'popover', dismiss = 'outside-and-escape', width }: {
  follow?: PopoverFollow; surface?: PopoverSurface; dismiss?: PopoverDismiss; width?: number;
}) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button ref={anchorRef} onClick={() => setOpen((v) => !v)}>anchor</button>
      <p>elsewhere</p>
      <PopoverPanel
        anchorRef={anchorRef}
        open={open}
        onClose={() => setOpen(false)}
        follow={follow}
        prefer="above"
        surface={surface}
        dismiss={dismiss}
        role="menu"
        width={width}
        testId="panel"
      >
        <button>item</button>
      </PopoverPanel>
    </div>
  );
}

describe('PopoverPanel', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.textContent === 'anchor') return rect(anchorTop, 32);
      return rect(0, 0);
    });
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(240);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    anchorTop = 400;
  });

  it('portals a fixed, measured menu above the anchor in the popover surface', () => {
    render(<Host width={240} />);
    const panel = screen.getByTestId('panel');
    expect(panel.parentElement).toBe(document.body);
    expect(panel).toHaveAttribute('role', 'menu');
    expect(panel.style.position).toBe('fixed');
    expect(panel.style.visibility).toBe('visible');
    expect(panel.style.width).toBe('240px');
    expect(panel.style.top).toBe(`${400 - 4 - 200}px`);
    expect(panel.style.left).toBe(`${932 - 240}px`);
    expect(panel.dataset.side).toBe('above');
    expect(panel).toHaveClass('rounded-xl', 'py-1', 'shadow-2xl', 'overflow-hidden');
  });

  it('flips below when there is no room above', () => {
    anchorTop = 100;
    render(<Host />);
    expect(screen.getByTestId('panel').dataset.side).toBe('below');
    expect(screen.getByTestId('panel').style.top).toBe('136px');
  });

  it('menu surface is MENU_PANEL_CLASS; none adds no class at all', () => {
    const { unmount } = render(<Host surface="menu" />);
    expect(screen.getByTestId('panel')).toHaveClass(...MENU_PANEL_CLASS.split(' '));
    unmount();
    render(<Host surface="none" />);
    expect(screen.getByTestId('panel')).not.toHaveAttribute('class');
  });

  it('closes on a press outside and on Escape, not on the anchor or inside', () => {
    render(<Host />);
    fireEvent.mouseDown(screen.getByText('item'));
    fireEvent.mouseDown(screen.getByText('anchor'));
    expect(screen.getByTestId('panel')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText('elsewhere'));
    expect(screen.queryByTestId('panel')).toBeNull();
  });

  it('Escape closes', () => {
    render(<Host />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('panel')).toBeNull();
  });

  it('host dismissal leaves outside presses alone', () => {
    render(<Host dismiss="host" />);
    fireEvent.mouseDown(screen.getByText('elsewhere'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('panel')).toBeInTheDocument();
  });

  it('follow close shuts on scroll; follow track re-measures instead', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(0); return 0; });
    const { unmount } = render(<Host follow="close" />);
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(screen.queryByTestId('panel')).toBeNull();
    unmount();
    render(<Host follow="track" />);
    anchorTop = 500;
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(screen.getByTestId('panel').style.top).toBe(`${500 - 4 - 200}px`);
  });

  it('closed renders nothing and reopening measures again', () => {
    render(<Host />);
    fireEvent.click(screen.getByText('anchor'));
    expect(screen.queryByTestId('panel')).toBeNull();
    fireEvent.click(screen.getByText('anchor'));
    expect(screen.getByTestId('panel').style.visibility).toBe('visible');
  });
});
