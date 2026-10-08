'use client';

import Button from '@/components/ui/buttons/Button';
import type { HTMLAttributes, ReactNode } from 'react';
import { circleVoiceButtonClass } from '@/utils/voice/control-button-class';

type CircleBtnProps = {
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLButtonElement>;

/** A round toggle in the room's floating control bar; its title is also its accessible name. */
export default function CircleBtn({ active, danger, onClick, title, children, className, ...rest }: CircleBtnProps) {
  return (
    <Button
      variant="bare"
      {...rest}
      onClick={onClick}
      title={title}
      aria-label={title}
      className={circleVoiceButtonClass(active, danger, className)}
    >
      {children}
    </Button>
  );
}
