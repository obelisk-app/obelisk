'use client';

import { useEffect } from 'react';
import ChannelEmoji from './ChannelEmoji';

interface ChannelTopicModalProps {
  channelName: string;
  channelType: string;
  channelEmoji?: string | null;
  description: string;
  onClose: () => void;
}

export default function ChannelTopicModal({
  channelName,
  channelType,
  channelEmoji,
  description,
  onClose,
}: ChannelTopicModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const typeIcon = channelType === 'forum' ? '💬' : channelType === 'voice' ? '🎙' : '#';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      data-testid="channel-topic-modal"
    >
      <div
        className="w-full max-w-lg mx-4 rounded-xl bg-lc-dark border border-lc-border p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lc-white text-xl font-bold">Tema del canal</h2>
            <div className="mt-1 flex items-center gap-1.5 text-lc-muted text-sm">
              <span className="font-bold">{typeIcon}</span>
              {channelEmoji && <ChannelEmoji value={channelEmoji} />}
              <span>|</span>
              <span>{channelName}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-lc-muted hover:text-lc-white transition-colors p-1 -mr-1 -mt-1"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="mt-5 text-lc-white text-sm whitespace-pre-wrap break-words">
          {description}
        </div>
      </div>
    </div>
  );
}
