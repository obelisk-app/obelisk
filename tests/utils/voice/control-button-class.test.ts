import { describe, expect, it } from 'vitest';
import { circleVoiceButtonClass, smallVoiceButtonClass } from '@/utils/voice/control-button-class';

describe('smallVoiceButtonClass', () => {
  const base = 'flex-1 h-8 rounded-md flex items-center justify-center transition-colors ';

  it('danger wins over active, and neither is the idle look', () => {
    expect(smallVoiceButtonClass(true, true)).toBe(base + 'bg-red-600/20 text-red-400 hover:bg-red-600/30');
    expect(smallVoiceButtonClass(true)).toBe(base + 'bg-lc-green/20 text-lc-green hover:bg-lc-green/30');
    expect(smallVoiceButtonClass(false, false)).toBe(base + 'bg-lc-border/40 hover:bg-lc-border/60 text-lc-muted hover:text-lc-white');
  });
});

describe('circleVoiceButtonClass', () => {
  const base = 'w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 ';

  it('danger wins over active, and neither is the idle look', () => {
    expect(circleVoiceButtonClass(true, true)).toBe(base + 'bg-red-500/15 text-red-300 hover:bg-red-500/25 ring-1 ring-red-500/30');
    expect(circleVoiceButtonClass(true)).toBe(base + 'bg-lc-green/20 text-lc-green hover:bg-lc-green/30 ring-1 ring-lc-green/40');
    expect(circleVoiceButtonClass(false)).toBe(base + 'bg-white/5 text-white/85 hover:bg-white/10 ring-1 ring-white/10');
  });

  it('appends an extra class after a space, and nothing for an empty one', () => {
    expect(circleVoiceButtonClass(false, false, 'hidden sm:flex')).toBe(
      base + 'bg-white/5 text-white/85 hover:bg-white/10 ring-1 ring-white/10 hidden sm:flex',
    );
    expect(circleVoiceButtonClass(false, false, '')).toBe(base + 'bg-white/5 text-white/85 hover:bg-white/10 ring-1 ring-white/10');
  });
});
