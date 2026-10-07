import IconSvg, { type IconProps } from './IconSvg';

/**
 * "Add a reaction": the Obelisk mark as a face, in accent green, with a
 * small plus badge. Replaces a bare `+`, which read as "add" of anything.
 * Filled, not stroked: at 18px a line face is unreadable. Every part sets
 * its own fill, so the frame's stroke is switched off.
 */
export default function ObeliskReactIcon({ size = 18, ...props }: IconProps) {
  return (
    <IconSvg size={size} stroke="none" {...props}>
      {/* pyramidion + broad tapered shaft + plinth */}
      <path d="M12 .8 16.4 5.2 17.6 19.8H6.4L7.6 5.2z" fill="var(--color-lc-green, #b4f953)" />
      <rect x="4.9" y="19.6" width="14.2" height="3" rx="1" fill="var(--color-lc-green, #b4f953)" />
      {/* face */}
      <circle cx="10.2" cy="10.4" r="1.25" fill="var(--obelisk-accent-ink, #0a0a0a)" />
      <circle cx="13.8" cy="10.4" r="1.25" fill="var(--obelisk-accent-ink, #0a0a0a)" />
      <path d="M9.5 13.5q2.5 2.6 5 0" fill="none" stroke="var(--obelisk-accent-ink, #0a0a0a)" strokeWidth="1.5" strokeLinecap="round" />
      {/* plus badge */}
      <circle cx="19.3" cy="17.3" r="4.2" fill="var(--color-lc-dark, #171717)" stroke="var(--color-lc-green, #b4f953)" strokeWidth="1.3" />
      <path d="M19.3 15.4v3.8M17.4 17.3h3.8" stroke="var(--color-lc-green, #b4f953)" strokeWidth="1.6" strokeLinecap="round" />
    </IconSvg>
  );
}
