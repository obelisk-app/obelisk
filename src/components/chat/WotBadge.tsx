'use client';

import { useWotDistance, useWotEnabled } from '@/lib/wot';

/**
 * Pill showing WoT distance for `pubkey`. Hidden when WoT is disabled or
 * the verdict is unresolved (avoids visual noise during cold-start).
 */
export default function WotBadge({ pubkey, className = '' }: { pubkey: string; className?: string }) {
  const enabled = useWotEnabled();
  const distance = useWotDistance(pubkey);
  if (!enabled) return null;
  const label = distance === null ? '—' : `${distance}°`;
  const tone =
    distance === null ? 'border-lc-border text-lc-muted' :
    distance === 0 ? 'border-lc-green/60 text-lc-green' :
    distance <= 1 ? 'border-lc-green/40 text-lc-green' :
    'border-lc-border text-lc-muted';
  return (
    <span
      title={distance === null ? 'Out of WoT or unresolved' : `${distance} hop${distance === 1 ? '' : 's'} from you`}
      className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-mono ${tone} ${className}`}
    >
      {label}
    </span>
  );
}
