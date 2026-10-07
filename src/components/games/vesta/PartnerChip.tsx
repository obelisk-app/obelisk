'use client';

import UiChip from '@/components/ui/data/Chip';

/** Who to trade with: the bank or one of the other seats. */
export default function PartnerChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <UiChip size="10" state={active ? 'selected' : 'idle'} onClick={onClick}>
      {label}
    </UiChip>
  );
}
