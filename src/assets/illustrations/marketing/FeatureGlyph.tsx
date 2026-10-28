import type { ReactNode } from 'react';
import type { LandingFeatureId } from '@/constants/marketing/landing';

/**
 * The icon on one landing feature card: a little scene on a 32-unit grid that
 * moves on its own, as on Obelisk Sky's feature tiles. The motion is all CSS
 * (`.lc-ico-*` in globals.css), so the card stays a server component, and
 * reduced motion stills it.
 */
export default function FeatureGlyph({ feature }: { feature: LandingFeatureId }) {
  return (
    <svg className={`lc-ico lc-ico-${feature}`} viewBox="0 0 32 32" aria-hidden="true">
      {SCENES[feature]}
    </svg>
  );
}

const SCENES: Record<LandingFeatureId, ReactNode> = {
  // NIP-29 groups: signals run from the relay out to each community, which lights up as one arrives.
  realtimeChat: (
    <>
      <path d="M16 16.5V5.5M16 16.5 5.5 25.5M16 16.5 26.5 25.5" />
      <path className="sig" pathLength={10} d="M16 16.5V5.5" />
      <path className="sig s2" pathLength={10} d="M16 16.5 5.5 25.5" />
      <path className="sig s3" pathLength={10} d="M16 16.5 26.5 25.5" />
      <circle className="hub" cx="16" cy="16.5" r="2.6" />
      <circle className="node" cx="16" cy="5.5" r="3.2" />
      <circle className="node n2" cx="5.5" cy="25.5" r="3.2" />
      <circle className="node n3" cx="26.5" cy="25.5" r="3.2" />
    </>
  ),
  // Encrypted DMs: the shackle snaps shut, the keyhole lights, a glint.
  encryptedDMs: (
    <>
      <path className="shackle" d="M10.5 15v-4.5a5.5 5.5 0 0 1 11 0V15" />
      <rect className="body" x="7" y="14.5" width="18" height="13" rx="3" />
      <path className="hole" d="M16 19.5v3.5" />
      <path className="spark" d="M27 3.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8Z" />
    </>
  ),
  // Voice: the mic's level bars bounce and the sound waves pulse out.
  voice: (
    <>
      <path className="wave" d="M7.5 4.5q-2.6 3.5 0 7M24.5 4.5q2.6 3.5 0 7" />
      <path className="wave w2" d="M4.5 2.5q-4.2 5.5 0 11M27.5 2.5q4.2 5.5 0 11" />
      <rect className="mic" x="11.5" y="3.5" width="9" height="15" rx="4.5" />
      <path className="eq" d="M14 9.5v3" />
      <path className="eq e2" d="M16 8v6" />
      <path className="eq e3" d="M18 9.5v3" />
      <path d="M7.5 15.5a8.5 8.5 0 0 0 17 0M16 24v4M12 28h8" />
    </>
  ),
  // No backend: a signed event leaves the browser and lands straight on the relay, which pings.
  selfHosted: (
    <>
      <rect className="win" x="2.5" y="8" width="15" height="12" rx="2" />
      <path d="M2.5 11.5h15" />
      <path className="link" d="M17.5 14h7" />
      <circle className="packet" cx="19" cy="14" r="1.4" />
      <circle className="ping" cx="27" cy="14" r="2.5" />
      <circle className="relay" cx="27" cy="14" r="2.5" />
      <path d="M27 16.5V24M23.5 24h7" />
    </>
  ),
  // Zaps: the bolt strikes and sats spark off it.
  zaps: (
    <>
      <path className="bolt" d="M18 2.5 7.5 18h7l-1.5 11.5L24.5 13h-7Z" />
      <circle className="sat" cx="26" cy="6" r="1.6" />
      <circle className="sat t2" cx="6" cy="9" r="1.3" />
      <circle className="sat t3" cx="26.5" cy="23" r="1.3" />
    </>
  ),
  // Games: the pad rocks, its buttons get pressed, orbs pop one after another (a chain reaction).
  games: (
    <>
      <circle className="orb" cx="11" cy="4.2" r="1.5" />
      <circle className="orb o2" cx="16" cy="4.2" r="1.5" />
      <circle className="orb o3" cx="21" cy="4.2" r="1.5" />
      <g className="pad">
        <path className="body" d="M9.5 9h13a6.5 6.5 0 0 1 6.5 6.5v3a4.5 4.5 0 0 1-8.3 2.4L19.6 19h-7.2l-1.1 1.9A4.5 4.5 0 0 1 3 18.5v-3A6.5 6.5 0 0 1 9.5 9Z" />
        <path d="M10 12.5v5.5M7.25 15.25h5.5" />
        <circle className="key" cx="21.8" cy="13.6" r="1.3" />
        <circle className="key k2" cx="24.6" cy="16.4" r="1.3" />
      </g>
    </>
  ),
};
