'use client';

import Button from '@/components/ui/buttons/Button';
import type { HTMLAttributes, ReactNode } from 'react';
import { smallVoiceButtonClass } from '@/utils/voice/control-button-class';

type SmallBtnProps = {
  active: boolean;
  danger?: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
} & HTMLAttributes<HTMLButtonElement>;

/** A small square toggle in the sidebar's voice status bar. */
export default function SmallBtn({ active, danger, onClick, title, children, ...rest }: SmallBtnProps) {
  return (
    <Button variant="bare" {...rest} onClick={onClick} title={title} className={smallVoiceButtonClass(active, danger)}>
      {children}
    </Button>
  );
}
