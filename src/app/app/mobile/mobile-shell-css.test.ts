import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, 'mobile-shell.css'), 'utf8');

const ruleBody = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  if (!match) throw new Error(`Missing CSS rule for ${selector}`);
  return match[1];
};

describe('mobile shell CSS', () => {
  it('rounds the mobile server channel pane top-left corner like desktop', () => {
    const pane = ruleBody('.obelisk-mobile .server-channel-pane');
    expect(pane).toContain('border-top-left-radius: 0.75rem');
    expect(pane).toContain('border-left: 1px solid var(--app-line-soft)');
    expect(pane).toContain('border-top: 1px solid var(--app-line-soft)');
    expect(pane).toContain('overflow: hidden');
  });

  it('uses compositor-only page transitions with containment and no laggy CSS animations', () => {
    const anim = ruleBody('.obelisk-mobile .screen-anim');
    expect(anim).toContain('will-change: transform, opacity');
    expect(anim).toContain('contain: layout paint style');
    expect(anim).toContain('backface-visibility: hidden');
    expect(anim).toContain('transform: translate3d(0, 0, 0)');

    expect(ruleBody('.obelisk-mobile .screen-anim.slide-forward')).not.toContain('animation:');
    expect(ruleBody('.obelisk-mobile .screen-anim.slide-back')).not.toContain('animation:');
    expect(css).not.toContain('@keyframes obelisk-slide-from-right');
    expect(css).not.toContain('@keyframes obelisk-slide-from-left');
  });

  it('locks the mobile PWA shell to native-feeling touch and viewport behavior', () => {
    const root = ruleBody('.obelisk-mobile');
    expect(root).toContain('height: calc(100dvh - var(--kb-inset, 0px))');
    expect(root).toContain('overscroll-behavior: none');
    expect(root).toContain('touch-action: manipulation');
    expect(root).toContain('-webkit-tap-highlight-color: transparent');
    expect(root).toContain('-webkit-touch-callout: none');
    expect(root).toContain('user-select: none');

    const host = ruleBody('.obelisk-mobile .screens-host');
    expect(host).toContain('min-width: 0');
    expect(host).toContain('min-height: 0');
    expect(host).toContain('overflow: hidden');
  });

  it('keeps scroll surfaces momentum-friendly without blocking vertical pans in horizontal lists', () => {
    const nativeY = ruleBody('.obelisk-mobile :where(.native-scroll-y)');
    expect(nativeY).toContain('-webkit-overflow-scrolling: touch');
    expect(nativeY).toContain('overscroll-behavior-y: contain');
    expect(nativeY).toContain('scroll-behavior: smooth');

    const nativeX = ruleBody('.obelisk-mobile :where(.native-scroll-x)');
    expect(nativeX).toContain('-webkit-overflow-scrolling: touch');
    expect(nativeX).toContain('touch-action: pan-x pan-y');
    expect(nativeX).toContain('overscroll-behavior-x: contain');
    expect(nativeX).toContain('overscroll-behavior-y: auto');
    expect(css).not.toContain('touch-action: pan-x;');
  });

  it('restores selection only where mobile users need text entry or message copy', () => {
    const selectable = ruleBody(`.obelisk-mobile input,
.obelisk-mobile textarea,
.obelisk-mobile [contenteditable='true'],
.obelisk-mobile [data-testid="message-content"]`);
    expect(selectable).toContain('user-select: text');
    expect(selectable).toContain('-webkit-user-select: text');
  });

});
