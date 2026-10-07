'use client';

import Button from '@/components/ui/buttons/Button';

/** One of the turn's actions (roll, buy a card, end the turn), enabled when the engine would take it. */
export default function ActionButton({ label, enabled, onClick }: { label: string; enabled: boolean; onClick: () => void }) {
  return (
    <Button
      variant="outlinePill"
      size="xs"
      disabled={!enabled}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
