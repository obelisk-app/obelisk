import ChainReactionPreview from './ChainReactionPreview';
import VestaPreview from './VestaPreview';

/**
 * Thumbnail for a game type in the picker, falling back to its catalog glyph.
 *
 * Each known game draws a fixed mid-game snapshot in the real board's
 * colours (`ChainReactionPreview`, `VestaPreview`), so the picker shows what
 * you are about to get rather than a generic icon.
 */
export function GameTypePreview({ type, size = 56, icon }: { type: string; size?: number; icon?: string }) {
  if (type === 'chain-reaction') return <ChainReactionPreview size={size} />;
  if (type === 'vesta') return <VestaPreview size={size} />;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg bg-lc-border/40 text-2xl"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {icon ?? '🎲'}
    </span>
  );
}
