import { afterEach, describe, expect, it } from 'vitest';
import { findHintAnchor, hintTaughtBy } from '@/utils/hints/anchors';
import { HINTS } from '@/constants/hints/registry';

/** A laid-out element: jsdom has no layout, so offsetParent is stubbed. */
function mount(anchor: string, visible = true) {
  const el = document.createElement('button');
  el.setAttribute('data-tour', anchor);
  Object.defineProperty(el, 'offsetParent', { get: () => (visible ? document.body : null) });
  document.body.appendChild(el);
  return el;
}

afterEach(() => { document.body.innerHTML = ''; });

describe('hint anchor helpers', () => {
  it('finds only an anchor that is laid out', () => {
    const el = mount('x-shown');
    mount('x-hidden', false);
    expect(findHintAnchor('x-shown')).toBe(el);
    expect(findHintAnchor('x-hidden')).toBeNull();
    expect(findHintAnchor('x-missing')).toBeNull();
  });

  it('names the hint a press inside an anchor teaches', () => {
    const hint = HINTS[0];
    const el = mount(hint.anchor);
    const inner = document.createElement('span');
    el.appendChild(inner);
    expect(hintTaughtBy(inner)).toBe(hint.id);
    expect(hintTaughtBy(document.body)).toBeUndefined();
  });
});
