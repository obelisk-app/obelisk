/**
 * Class names of the call's toggle buttons. `danger` (a muted mic, a
 * deafened call) wins over `active` (a live mic, a camera that is on);
 * neither is the idle look.
 */

const SMALL_BASE = 'flex-1 h-8 rounded-md flex items-center justify-center transition-colors ';
const CIRCLE_BASE = 'w-11 h-11 rounded-full flex items-center justify-center transition-all active:scale-95 ';

/** A small square button in the sidebar's voice status bar. */
export function smallVoiceButtonClass(active: boolean, danger?: boolean): string {
  if (danger) return SMALL_BASE + 'bg-red-600/20 text-red-400 hover:bg-red-600/30';
  if (active) return SMALL_BASE + 'bg-lc-green/20 text-lc-green hover:bg-lc-green/30';
  return SMALL_BASE + 'bg-lc-border/40 hover:bg-lc-border/60 text-lc-muted hover:text-lc-white';
}

/** A round button in the room's floating control bar; `className` is appended after a space. */
export function circleVoiceButtonClass(active: boolean, danger?: boolean, className?: string): string {
  const look = danger
    ? 'bg-red-500/15 text-red-300 hover:bg-red-500/25 ring-1 ring-red-500/30'
    : active
      ? 'bg-lc-green/20 text-lc-green hover:bg-lc-green/30 ring-1 ring-lc-green/40'
      : 'bg-white/5 text-white/85 hover:bg-white/10 ring-1 ring-white/10';
  return CIRCLE_BASE + look + (className ? ' ' + className : '');
}
