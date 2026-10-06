'use client';

import { avatarInitials } from '@/utils/identity/display-name';
import RemoteImage from '@/components/ui/RemoteImage';

const PALETTES = [
  { from: '#4a78a8', to: '#7ec8ff', text: '#fff' },
  { from: '#a85a78', to: '#ff9ec5', text: '#fff' },
  { from: '#7a5aa8', to: '#c9a8ff', text: '#fff' },
  { from: '#6b8a2e', to: '#b4f953', text: '#0a0a0a' },
  { from: '#3a7050', to: '#8bc34a', text: '#0a0a0a' },
  { from: '#a87b3a', to: '#f0c14a', text: '#0a0a0a' },
];

function paletteFor(seed: string): { from: string; to: string; text: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

export function avatarStyle(seed: string): React.CSSProperties {
  const p = paletteFor(seed);
  return { background: `linear-gradient(135deg, ${p.from}, ${p.to})`, color: p.text };
}

export function NameAvatar({
  pubkey,
  name,
  picture,
  size = 36,
  className = '',
}: {
  pubkey: string;
  name?: string | null;
  picture?: string | null;
  size?: number;
  className?: string;
}) {
  // Never letters off an npub: that rendered avatars reading `NP`.
  const initials = avatarInitials(name, pubkey);
  const style: React.CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.max(10, Math.floor(size * 0.36)),
    ...avatarStyle(pubkey || name || 'x'),
  };
  return (
    <div className={className} style={style}>
      {picture ? <RemoteImage src={picture} alt="" /> : initials}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// bottom nav
