'use client';

import type { ReactNode } from 'react';
import { useSpoilerText } from '@/hooks/chat/message/useSpoilerText';
import { useTranslations } from 'next-intl';

export default function SpoilerText({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const vm = useSpoilerText();

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={vm.reveal}
      onKeyDown={vm.onKeyDown}
      className={`rounded px-0.5 cursor-pointer transition-all duration-200 ${
        vm.revealed
          ? 'bg-lc-border/50 text-lc-white'
          : 'bg-lc-muted/60 text-transparent select-none'
      }`}
      data-testid="spoiler-text"
      aria-label={vm.revealed ? undefined : t('chat.spoilerReveal')}
    >
      {children}
    </span>
  );
}
