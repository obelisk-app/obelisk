'use client';

import Text from '@/components/ui/layout/Text';
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import CloseButton from '@/components/ui/buttons/CloseButton';

/** The text chat docked beside a voice room, resizable from its left edge. */
export function VoiceChatRail({ width, onResize, onHide, children }: {
  width: number;
  onResize: (e: ReactMouseEvent<HTMLDivElement>) => void;
  onHide: () => void;
  children: ReactNode;
}) {
  const t = useTranslations();
  return (
    <aside
      id="voice-chat-rail"
      style={{ width }}
      className="relative flex flex-col min-h-0 shrink-0 my-0 rounded-xl border border-lc-border bg-lc-dark shadow-xl overflow-hidden"
    >
      <div
        onMouseDown={onResize}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-lc-green/40 active:bg-lc-green/60 z-10"
        title={t('shell.desktop.voiceChat.dragResize')}
      />
      <div className="h-12 px-4 border-b border-lc-border flex items-center justify-between shrink-0">
        <Text size="sm" tone="default" weight="semibold">{t('shell.desktop.voiceChat.chat')}</Text>
        <CloseButton size="sm" onClick={onHide} label={t('shell.desktop.voiceChat.hideChat')} title={t('shell.desktop.voiceChat.hideChat')} />
      </div>
      <div className="flex flex-1 flex-col min-h-0">{children}</div>
    </aside>
  );
}
