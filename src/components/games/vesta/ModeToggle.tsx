'use client';

import UiChip from '@/components/ui/data/Chip';

/** A build mode (settlement, road, city): selected while the board is asking for that piece. */
export default function ModeToggle({ label, active, enabled, onClick }: { label: string; active: boolean; enabled: boolean; onClick: () => void }) {
  return (
    <UiChip size="11" state={active ? 'selected' : 'idle'} disabled={!enabled} onClick={onClick}>
      {label}
    </UiChip>
  );
}
