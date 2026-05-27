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
});
