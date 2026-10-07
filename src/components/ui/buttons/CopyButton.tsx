'use client';

import type { ButtonHTMLAttributes } from 'react';
import { useCopyButton } from '@/hooks/common/useCopyButton';
import Button from './Button';
import { CheckIcon, CopyIcon } from '../icons/icons';

/** `sm` sits in a list row (`p-1`, 14px icon); `md` in a toolbar (`p-2`, 16px icon). */
export type CopyButtonSize = 'sm' | 'md';

const SIZE: Record<CopyButtonSize, { button: 'icon' | 'icon-md'; icon: number }> = {
  sm: { button: 'icon', icon: 14 },
  md: { button: 'icon-md', icon: 16 },
};

export interface CopyButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type' | 'onClick'> {
  /** What lands on the clipboard. */
  text: string;
  /** Accessible name at rest, already translated ("Copy npub"). */
  label: string;
  /** Accessible name and announcement for the moment after a copy ("Copied"). */
  copiedLabel: string;
  size?: CopyButtonSize;
  /** Runs after a successful copy, e.g. to push a toast. */
  onCopied?: () => void;
}

/**
 * Copy icon that flips to a green tick for the hook's default 2000 ms. Built
 * on `useCopyToClipboard`, so a refused clipboard leaves the copy icon in
 * place rather than claiming success.
 */
export default function CopyButton({ text, label, copiedLabel, size = 'sm', onCopied, className, ...rest }: CopyButtonProps) {
  const { done, copy } = useCopyButton(text, onCopied);
  const spec = SIZE[size];
  return (
    <Button
      variant="ghost"
      size={spec.button}
      aria-label={done ? copiedLabel : label}
      title={done ? copiedLabel : label}
      onClick={copy}
      className={className}
      {...rest}
    >
      {/* Green goes on the tick itself. Putting it on the button set it beside
          the ghost variant's grey text colour, and cn() only joins strings, so
          which colour won was down to Tailwind's stylesheet order: grey did. */}
      {done ? <CheckIcon size={spec.icon} className="text-lc-green" /> : <CopyIcon size={spec.icon} />}
      <span role="status" className="sr-only">{done ? copiedLabel : ''}</span>
    </Button>
  );
}
