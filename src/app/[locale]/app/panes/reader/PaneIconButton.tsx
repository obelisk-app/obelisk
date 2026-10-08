'use client';

import Button from '@/components/ui/buttons/Button';
import type { ComponentType } from 'react';
import type { IconProps } from '@/assets/icons';

/** A square icon button for the reader and feed pane headers, drawing `icon` at the panes' size and weight. */
export function PaneIconButton({
  label,
  testId,
  onClick,
  icon: Icon,
}: {
  label: string;
  testId: string;
  onClick: () => void;
  icon: ComponentType<IconProps>;
}) {
  return (
    <Button
      variant="toolIcon"
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testId}
    >
      <Icon size={18} strokeWidth={2} />
    </Button>
  );
}
