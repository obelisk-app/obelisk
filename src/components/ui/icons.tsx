/**
 * Line icons for UI chrome — menus, buttons, help cards.
 *
 * Design rule (CLAUDE.md, "Design System"): UI chrome uses these SVGs, not
 * emoji or text glyphs (`⋯`, `★`, `↪`). A glyph renders in whatever font the
 * OS picks — different size, weight and baseline on every platform, and
 * emoji ignore `currentColor`, so hover/active/danger colours can't reach
 * them. These inherit colour and size from the surrounding text.
 *
 * 24×24 viewBox, 1.8 stroke, round caps — the same family as the inline
 * SVGs already used across the shells.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const MoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </Svg>
);
export const ShareIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" /></Svg>
);
export const LinkIcon = (p: IconProps) => (
  <Svg {...p}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></Svg>
);
export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><path d="M15 3h6v6M10 14 21 3" /></Svg>
);
export const KeyIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.7 12.3 8.8-8.8M16 7l3 3M18.5 4.5l2 2" /></Svg>
);
export const HashIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" /></Svg>
);
export const CopyIcon = (p: IconProps) => (
  <Svg {...p}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>
);
export const ZapIcon = (p: IconProps) => (
  <Svg {...p}><path d="M13 2 3 14h8l-1 8 10-12h-8l1-8z" /></Svg>
);
export const BellOffIcon = (p: IconProps) => (
  <Svg {...p}><path d="M8.7 3.3A6 6 0 0 1 18 8c0 3.1.7 5.1 1.4 6.4M6.3 6.3A6 6 0 0 0 6 8c0 7-3 9-3 9h14" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0M2 2l20 20" /></Svg>
);
export const BanIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></Svg>
);
export const MessageIcon = (p: IconProps) => (
  <Svg {...p}><path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.6A8.5 8.5 0 1 1 21 12z" /></Svg>
);
export const UserIcon = (p: IconProps) => (
  <Svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Svg>
);
export const EditIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></Svg>
);
export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></Svg>
);
export const GearIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Svg>
);
export const BellIcon = (p: IconProps) => (
  <Svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></Svg>
);
export const PaletteIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2.5a1.5 1.5 0 0 0-1 2.6A1.9 1.9 0 0 1 12 22z" /><circle cx="7.5" cy="10.5" r="1" fill="currentColor" /><circle cx="12" cy="7" r="1" fill="currentColor" /><circle cx="16.5" cy="10.5" r="1" fill="currentColor" /></Svg>
);
export const ServerIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="3" width="18" height="7" rx="2" /><rect x="3" y="14" width="18" height="7" rx="2" /><path d="M7 6.5h.01M7 17.5h.01" /></Svg>
);
export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></Svg>
);
export const SmileIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></Svg>
);
export const WrenchIcon = (p: IconProps) => (
  <Svg {...p}><path d="M14.7 6.3a4 4 0 0 0 5 5L22 13.6a1 1 0 0 1 0 1.4l-.6.6a1 1 0 0 1-1.4 0l-2.3-2.3a4 4 0 0 1-5-5L3.3 17.7a2.1 2.1 0 0 0 3 3l9.4-9.4" /></Svg>
);
export const LogOutIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Svg>
);
export const CheckBadgeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 2 14.4 4.2 17.7 4 18 7.3 20.4 9.6 18.9 12.5 20.4 15.4 18 17.7 17.7 21 14.4 20.8 12 23 9.6 20.8 6.3 21 6 17.7 3.6 15.4 5.1 12.5 3.6 9.6 6 7.3 6.3 4 9.6 4.2z" /><path d="m8.5 12.5 2.3 2.3 4.7-4.7" /></Svg>
);
export const GlobeIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></Svg>
);
export const CompassIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3z" /></Svg>
);
export const LayersIcon = (p: IconProps) => (
  <Svg {...p}><path d="m12 2 10 5-10 5L2 7z" /><path d="m2 17 10 5 10-5M2 12l10 5 10-5" /></Svg>
);
export const TerminalIcon = (p: IconProps) => (
  <Svg {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m6 9 3 3-3 3M12 15h6" /></Svg>
);
export const BookIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></Svg>
);
export const SparklesIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /><circle cx="12" cy="12" r="2.5" /></Svg>
);
export const ReplyIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Svg>
);
export const ForwardIcon = (p: IconProps) => (
  <Svg {...p}><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></Svg>
);
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" /></Svg>
);
export const CloseIcon = (p: IconProps) => (
  <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>
);
/** Outline by default; pass `filled` for the "on" state (favorited). */
export const StarIcon = ({ filled = false, ...p }: IconProps & { filled?: boolean }) => (
  <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
  </Svg>
);
export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>
);
export const CheckCircleIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.7 2.7L16.5 9.5" /></Svg>
);
export const ClockIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></Svg>
);
export const AtIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M16 8v5.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1" /></Svg>
);
export const PaperclipIcon = (p: IconProps) => (
  <Svg {...p}><path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" /></Svg>
);
export const FileIcon = (p: IconProps) => (
  <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /></Svg>
);
export const DownloadIcon = (p: IconProps) => (
  <Svg {...p}><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></Svg>
);
export const LockIcon = (p: IconProps) => (
  <Svg {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>
);
export const PhoneIcon = (p: IconProps) => (
  <Svg {...p}><path d="M5 4h3.5l1.8 4.4-2.3 1.5a11 11 0 0 0 6.1 6.1l1.5-2.3L20 15.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></Svg>
);
export const PhoneOffIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3 12.5c5-4.4 13-4.4 18 0l-2.2 2.9-3.3-1.4v-2.4a10 10 0 0 0-7 0V14l-3.3 1.4Z" /></Svg>
);
export const MicIcon = (p: IconProps) => (
  <Svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Svg>
);
export const MicOffIcon = (p: IconProps) => (
  <Svg {...p}><path d="M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M5 11a7 7 0 0 0 11.3 5.5M19 11a7 7 0 0 1-.6 2.9M12 18v3M3 3l18 18" /></Svg>
);
export const VideoOffIcon = (p: IconProps) => (
  <Svg {...p}><path d="M10 6h4a2 2 0 0 1 2 2v2.5l5-3v9l-3-1.8M16 16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2M3 3l18 18" /></Svg>
);
export const ScreenShareIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4M12 13V8M9.5 10.5 12 8l2.5 2.5" /></Svg>
);
export const FlipCameraIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 8h3l2-3h6l2 3h3v11H4Z" /><path d="M9.5 13.5a2.5 2.5 0 0 1 4.3-1.8M14.5 13.5a2.5 2.5 0 0 1-4.3 1.8M13.8 10.2v1.5h-1.5M10.2 16.8v-1.5h1.5" /></Svg>
);
export const MaximizeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Svg>
);
export const MinimizeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></Svg>
);
export const VideoIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10.5 5-3v9l-5-3" /></Svg>
);

/**
 * "Add a reaction" — the Obelisk mark as a face, in accent green, with a
 * small plus badge. Replaces a bare `+`, which read as "add" of anything.
 * Filled, not stroked: at 18px a line face is unreadable.
 */
export function ObeliskReactIcon({ size = 18, ...rest }: IconProps) {
  const green = 'var(--color-lc-green, #b4f953)';
  const ink = 'var(--obelisk-accent-ink, #0a0a0a)';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...rest}>
      {/* pyramidion + broad tapered shaft + plinth */}
      <path d="M12 .8 16.4 5.2 17.6 19.8H6.4L7.6 5.2z" fill={green} />
      <rect x="4.9" y="19.6" width="14.2" height="3" rx="1" fill={green} />
      {/* face */}
      <circle cx="10.2" cy="10.4" r="1.25" fill={ink} />
      <circle cx="13.8" cy="10.4" r="1.25" fill={ink} />
      <path d="M9.5 13.5q2.5 2.6 5 0" fill="none" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
      {/* plus badge */}
      <circle cx="19.3" cy="17.3" r="4.2" fill="var(--color-lc-dark, #171717)" stroke={green} strokeWidth="1.3" />
      <path d="M19.3 15.4v3.8M17.4 17.3h3.8" stroke={green} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
