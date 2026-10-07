'use client';

import { useQualityDot } from '@/hooks/voice/room/useQualityDot';

/** A peer's connection quality as a coloured dot, with the numbers in its tooltip. */
export default function QualityDot({ pubkey }: { pubkey: string }) {
  const vm = useQualityDot(pubkey);
  return (
    <span
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: vm.color, boxShadow: `0 0 6px ${vm.color}` }}
      title={vm.title}
      data-testid="peer-quality-dot"
      data-quality={vm.level}
    />
  );
}
