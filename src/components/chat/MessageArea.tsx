'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useChatStore, Message } from '@/store/chat';
import { useAuthStore } from '@/store/auth';
import { formatPubkey } from '@/lib/nostr';

function MessageContent({ content }: { content: string }) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const imageExtensions = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;

  const parts = content.split(urlRegex);

  return (
    <>
      {parts.map((part, i) => {
        if (urlRegex.test(part)) {
          // Reset lastIndex since we reuse the regex
          urlRegex.lastIndex = 0;
          if (imageExtensions.test(part)) {
            return (
              <span key={i}>
                <a href={part} target="_blank" rel="noopener noreferrer" className="text-lc-green/80 hover:underline text-xs break-all">{part}</a>
                <img
                  src={part}
                  alt=""
                  loading="lazy"
                  className="mt-1 max-w-sm max-h-80 rounded-lg object-contain bg-lc-black/50"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </span>
            );
          }
          return (
            <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-lc-green/80 hover:underline break-all">
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function ReplyPreview({ replyTo, profileCache }: {
  replyTo: { id: string; content: string; authorPubkey: string };
  profileCache: Map<string, { name?: string; picture?: string }>;
}) {
  const profile = profileCache.get(replyTo.authorPubkey);
  const name = profile?.name || formatPubkey(replyTo.authorPubkey);

  return (
    <div className="flex items-center gap-1.5 mb-1 pl-11 text-xs">
      <div className="w-0.5 h-4 bg-lc-green/40 rounded-full" />
      <span className="text-lc-green/70 font-medium">{name}</span>
      <span className="text-lc-muted truncate max-w-xs">{replyTo.content}</span>
    </div>
  );
}

function MessageBubble({ message, profileCache, onReply, onReport }: {
  message: Message & { replyTo?: { id: string; content: string; authorPubkey: string } | null };
  profileCache: Map<string, { name?: string; picture?: string }>;
  onReply: (msg: Message) => void;
  onReport: (msg: Message) => void;
}) {
  const profile = profileCache.get(message.authorPubkey);
  const displayName = profile?.name || formatPubkey(message.authorPubkey);
  const time = new Date(message.createdAt);
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const { profile: myProfile } = useAuthStore();
  const isMe = myProfile?.pubkey === message.authorPubkey;

  return (
    <div className="group">
      {/* Reply context */}
      {message.replyTo && (
        <ReplyPreview replyTo={message.replyTo} profileCache={profileCache} />
      )}

      <div className="flex items-start gap-3 px-4 py-1.5 hover:bg-lc-border/20 transition-colors relative">
        {/* Avatar */}
        {profile?.picture ? (
          <img
            src={profile.picture}
            alt={displayName}
            className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold shrink-0 mt-0.5">
            {displayName[0]?.toUpperCase() || '?'}
          </div>
        )}

        {/* Content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`text-sm font-semibold ${isMe ? 'text-lc-green' : 'text-lc-white'}`}>
              {displayName}
            </span>
            <span className="text-xs text-lc-muted">{timeStr}</span>
          </div>
          <div className="text-sm text-lc-white/90 break-words whitespace-pre-wrap">
            <MessageContent content={message.content} />
          </div>
        </div>

        {/* Action buttons — shown on hover */}
        <div className="absolute right-2 top-1 opacity-0 group-hover:opacity-100 flex gap-1 transition-all">
          <button
            onClick={() => onReply(message)}
            className="p-1 rounded bg-lc-dark border border-lc-border hover:border-lc-green/30 text-lc-muted hover:text-lc-green transition-all"
            title="Reply"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 17 4 12 9 7"/>
              <path d="M20 18v-2a4 4 0 00-4-4H4"/>
            </svg>
          </button>
          {!isMe && (
            <button
              onClick={() => onReport(message)}
              className="p-1 rounded bg-lc-dark border border-lc-border hover:border-red-500/30 text-lc-muted hover:text-red-400 transition-all"
              title="Report"
              data-testid="report-btn"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                <line x1="4" y1="22" x2="4" y2="15"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MessageArea({ profileCache }: { profileCache: Map<string, { name?: string; picture?: string }> }) {
  const { messages, isLoadingMessages, activeChannelId, pinnedChannels, categories } = useChatStore();
  const { setReplyingTo } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const [reportTarget, setReportTarget] = useState<Message | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportSending, setReportSending] = useState(false);

  const allChannels = [
    ...pinnedChannels,
    ...categories.flatMap(c => c.channels),
  ];
  const activeChannel = allChannels.find(c => c.id === activeChannelId);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const threshold = 100;
    isNearBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
  }, []);

  // Only auto-scroll if user is near the bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleReply = useCallback((msg: Message) => {
    setReplyingTo(msg);
  }, [setReplyingTo]);

  const handleReport = useCallback((msg: Message) => {
    setReportTarget(msg);
    setReportReason('');
  }, []);

  const submitReport = async () => {
    if (!reportTarget || !reportReason.trim()) return;
    setReportSending(true);
    await fetch('/api/moderation/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: reportTarget.id, reason: reportReason.trim() }),
    });
    setReportSending(false);
    setReportTarget(null);
  };

  if (!activeChannelId) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-lc-muted">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4 opacity-30">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
          <p className="text-lg font-medium">Select a channel</p>
          <p className="text-sm">Pick a channel from the sidebar to start chatting</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Report Modal */}
      {reportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" data-testid="report-modal">
          <div className="lc-card p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-lc-white mb-2">Report Message</h3>
            <div className="bg-lc-black/50 rounded-lg p-3 mb-3 border border-lc-border">
              <p className="text-sm text-lc-white truncate">{reportTarget.content}</p>
            </div>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Reason for report..."
              className="w-full px-3 py-2 rounded-lg bg-lc-dark border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none resize-none h-20"
            />
            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={() => setReportTarget(null)}
                className="px-4 py-2 rounded-full text-sm text-lc-muted border border-lc-border hover:border-lc-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitReport}
                disabled={!reportReason.trim() || reportSending}
                className="px-4 py-2 rounded-full text-sm text-white font-medium bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {reportSending ? 'Sending...' : 'Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Messages — scrollable */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-4"
      >
        {isLoadingMessages ? (
          <div className="px-4 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="lc-skeleton-circle w-8 h-8" />
                <div className="flex-1 space-y-1">
                  <div className="lc-skeleton h-4 w-24" />
                  <div className="lc-skeleton h-4 w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-lc-muted">
              <p className="text-lg font-medium mb-1">No messages yet</p>
              <p className="text-sm">Be the first to say something in #{activeChannel?.name}!</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                profileCache={profileCache}
                onReply={handleReply}
                onReport={handleReport}
              />
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>
    </div>
  );
}
