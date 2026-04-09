'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore, Category, Channel } from '@/store/chat';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notification';

function ChannelTypeIcon({ type }: { type: string }) {
  if (type === 'forum') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-lc-muted/60">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    );
  }
  if (type === 'voice') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-lc-muted/60">
        <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
        <path d="M19 10v2a7 7 0 01-14 0v-2"/>
      </svg>
    );
  }
  return <span className="shrink-0 text-lc-muted/60 font-bold text-xs">#</span>;
}

function ChannelItem({ channel, isActive, onClick }: { channel: Channel; isActive: boolean; onClick: () => void }) {
  const unreadCount = useNotificationStore((s) => s.channelUnreads[channel.id] || 0);
  const hasMention = useNotificationStore((s) => s.channelMentions[channel.id] || false);
  const hasUnread = unreadCount > 0;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-sm transition-colors ${
        isActive
          ? 'bg-lc-border text-lc-white font-medium'
          : hasUnread
            ? 'text-lc-white font-semibold hover:bg-lc-border/50'
            : 'text-lc-muted hover:text-lc-white hover:bg-lc-border/50'
      }`}
    >
      <ChannelTypeIcon type={channel.type} />
      {channel.emoji && <span className="text-sm">{channel.emoji}</span>}
      <span className="truncate">{channel.name}</span>
      {hasUnread && !isActive && (
        <span className={`ml-auto shrink-0 text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 ${
          hasMention
            ? 'bg-red-500 text-white'
            : 'bg-lc-muted/30 text-lc-white'
        }`}>
          {hasMention ? '@' : unreadCount}
        </span>
      )}
    </button>
  );
}

function CategorySection({ category, activeChannelId, onSelectChannel }: {
  category: Category;
  activeChannelId: string | null;
  onSelectChannel: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mt-4">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center gap-1 px-1 mb-1 text-[11px] font-semibold uppercase tracking-wider text-lc-muted hover:text-lc-white transition-colors"
      >
        <svg
          width="8" height="8" viewBox="0 0 24 24" fill="currentColor"
          className={`transition-transform ${collapsed ? '-rotate-90' : ''}`}
        >
          <path d="M7 10l5 5 5-5z"/>
        </svg>
        ──── [ {category.name} ] ────
      </button>
      {!collapsed && (
        <div className="space-y-0.5 pl-0.5">
          {category.channels.map((ch) => (
            <ChannelItem
              key={ch.id}
              channel={ch}
              isActive={ch.id === activeChannelId}
              onClick={() => onSelectChannel(ch.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserPanel() {
  const router = useRouter();
  const { profile, logout } = useAuthStore();

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <div className="p-2 border-t border-lc-border bg-lc-black/50 shrink-0">
      <div className="flex items-center gap-2 p-1.5 rounded-lg">
        {profile?.picture ? (
          <img src={profile.picture} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-semibold shrink-0">
            {(profile?.name || profile?.displayName || 'A')[0].toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-lc-white truncate">
            {profile?.displayName || profile?.name || 'Anon'}
          </div>
          <div className="text-[10px] text-lc-muted truncate font-mono">
            {profile?.npub ? `${profile.npub.slice(0, 16)}...` : ''}
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="p-1.5 rounded-md text-lc-muted hover:text-red-400 hover:bg-lc-border/50 transition shrink-0"
          title="Logout"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function ChannelSidebar({ onChannelSelect }: { onChannelSelect?: () => void } = {}) {
  const { servers, activeServerId, pinnedChannels, categories, activeChannelId, setActiveChannel, isLoadingChannels } = useChatStore();

  const activeServer = servers.find(s => s.id === activeServerId);

  if (isLoadingChannels) {
    return (
      <aside className="w-60 bg-lc-dark border-r border-lc-border flex flex-col shrink-0">
        <div className="p-4 border-b border-lc-border">
          <div className="lc-skeleton h-6 w-32" />
        </div>
        <div className="flex-1 p-3 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="lc-skeleton h-5 w-full" />
          ))}
        </div>
        <UserPanel />
      </aside>
    );
  }

  return (
    <aside className="w-60 bg-lc-dark border-r border-lc-border flex flex-col shrink-0">
      {/* Server header with banner */}
      <div className="relative shrink-0">
        {activeServer?.banner && (
          <div className="h-24 overflow-hidden">
            <img
              src={activeServer.banner}
              alt=""
              className="w-full h-full object-cover opacity-60"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-lc-dark" />
          </div>
        )}
        <div className={`${activeServer?.banner ? 'absolute bottom-0 left-0 right-0' : ''} p-3 flex items-center gap-2 border-b border-lc-border`}>
          {activeServer?.icon ? (
            <img src={activeServer.icon} alt={activeServer.name} className="w-6 h-6 rounded-full" />
          ) : (
            <div className="w-6 h-6 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-xs font-bold">
              {activeServer?.name?.[0] || 'O'}
            </div>
          )}
          <h2 className="font-semibold text-lc-white truncate text-sm">{activeServer?.name || 'Server'}</h2>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-lc-muted ml-auto shrink-0">
            <path d="M7 10l5 5 5-5z"/>
          </svg>
        </div>
      </div>

      {/* Channel list — scrollable */}
      <nav className="flex-1 overflow-y-auto p-2">
        {/* Pinned channels */}
        {pinnedChannels.length > 0 && (
          <div className="mb-1">
            <div className="px-1 mb-1 text-[11px] font-semibold uppercase tracking-wider text-lc-muted">
              Canales fijados
            </div>
            <div className="space-y-0.5">
              {pinnedChannels.map((ch) => (
                <ChannelItem
                  key={ch.id}
                  channel={ch}
                  isActive={ch.id === activeChannelId}
                  onClick={() => { setActiveChannel(ch.id); onChannelSelect?.(); }}
                />
              ))}
            </div>
          </div>
        )}

        {/* Categories */}
        {categories.map((cat) => (
          <CategorySection
            key={cat.id}
            category={cat}
            activeChannelId={activeChannelId}
            onSelectChannel={(id) => { setActiveChannel(id); onChannelSelect?.(); }}
          />
        ))}
      </nav>

      {/* User panel — always visible at bottom */}
      <UserPanel />
    </aside>
  );
}
