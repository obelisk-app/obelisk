import type { ReactElement } from 'react';
import type { PqProtectionLevel } from '@/services/chat/pq/status';

const SIZE = 16;

export function ShieldQuantum() {
  // Shield with a tick: everything the wrap gives, plus quantum protection.
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 11.5l2 2 4-4" />
    </svg>
  );
}

export function ShieldWrapped() {
  // Plain shield: contents locked and the social graph hidden.
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export function LockBasic() {
  // A padlock rather than a shield: the contents are locked, but the envelope
  // is not: deliberately a different silhouette, not a dimmer shield, so the
  // two are distinguishable without relying on colour.
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

/** The icon per protection level: two shields and, for the lowest rung, a padlock. */
export const ICONS: Record<PqProtectionLevel, () => ReactElement> = {
  quantum: ShieldQuantum,
  wrapped: ShieldWrapped,
  basic: LockBasic,
};
