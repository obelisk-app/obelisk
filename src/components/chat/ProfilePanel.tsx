'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuthStore } from '@/store/auth';
import { useChatStore } from '@/store/chat';
import { useSettingsStore } from '@/store/settings';
import { useToastStore } from '@/store/toast';
import { useTranslation } from '@/i18n/context';

interface ProfilePanelProps {
  onClose: () => void;
  onLogout: () => void;
}

export default function ProfilePanel({ onClose, onLogout }: ProfilePanelProps) {
  const profile = useAuthStore((s) => s.profile);
  const activeServerId = useChatStore((s) => s.activeServerId);
  const { t } = useTranslation();
  const [nickname, setNickname] = useState<string | null>(null);

  useEffect(() => {
    if (!activeServerId) { setNickname(null); return; }
    let cancelled = false;
    fetch(`/api/members/me?serverId=${activeServerId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled) setNickname(d?.nickname || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeServerId]);

  if (!profile) return null;
  if (typeof document === 'undefined') return null;

  const displayName = profile.displayName || profile.name || 'Anon';

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[65]" onClick={onClose} />

      {/* Panel — fixed bottom-left of the viewport, covering the ServerBar,
          Discord-style. Anchored by bottom so it always grows UPWARD and
          never overflows below the user bar. Scrolls internally when tall. */}
      <div
        className="fixed left-2 bottom-[72px] w-[340px] max-w-[calc(100vw-1rem)] max-h-[calc(100vh-88px)] overflow-y-auto bg-lc-dark border border-lc-border rounded-xl shadow-2xl z-[70]"
        style={{ top: 'auto' }}
      >
        {/* Banner area */}
        {profile.banner ? (
          <div className="h-28 overflow-hidden relative">
            <img src={profile.banner} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="h-20 bg-gradient-to-r from-lc-olive/30 to-lc-dark" />
        )}

        {/* Avatar + name */}
        <div className="px-5 -mt-10 relative">
          {profile.picture ? (
            <img
              src={profile.picture}
              alt={displayName}
              className="w-20 h-20 rounded-full object-cover ring-4 ring-lc-dark"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-2xl font-semibold ring-4 ring-lc-dark">
              {displayName[0].toUpperCase()}
            </div>
          )}
          <div className="mt-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-lg font-semibold text-lc-white">{displayName}</span>
              {nickname && (
                <span
                  className="text-xs text-lc-muted"
                  title="Alias en este servidor"
                >
                  · alias aquí: <span className="text-lc-white/90">{nickname}</span>
                </span>
              )}
            </div>
            {profile.nip05 && (
              <div className="text-xs text-lc-green truncate">{profile.nip05}</div>
            )}
            <div className="text-[10px] text-lc-muted font-mono mt-0.5 truncate">
              {profile.npub ? `${profile.npub.slice(0, 24)}...` : ''}
            </div>
          </div>
        </div>

        {/* About */}
        {profile.about && (
          <div className="px-4 mt-2">
            <div className="text-[10px] uppercase tracking-wider text-lc-muted font-semibold">{t('profile.about')}</div>
            <div className="text-xs text-lc-muted mt-0.5 line-clamp-3">{profile.about}</div>
          </div>
        )}

        <div className="border-t border-lc-border mt-3" />

        {/* Copy npub */}
        {profile.npub && (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(profile.npub!).catch(() => {});
              useToastStore.getState().pushToast({
                title: 'npub copiado',
                body: `${profile.npub!.slice(0, 12)}…${profile.npub!.slice(-6)}`,
              });
            }}
            className="w-full p-3 text-left text-sm text-lc-white hover:bg-lc-border/50 transition flex items-center gap-2"
            data-testid="copy-own-npub-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
            Copiar npub
          </button>
        )}

        {/* Open in another Nostr client */}
        {profile.npub && (
          <a
            href={`https://njump.me/${profile.npub}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full p-3 text-left text-sm text-lc-white hover:bg-lc-border/50 transition flex items-center gap-2"
            data-testid="open-own-nostr-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Abrir en otro cliente Nostr
          </a>
        )}

        <div className="border-t border-lc-border" />

        {/* Editar perfil — single action, opens settings modal on the Perfil tab */}
        <button
          onClick={() => { useSettingsStore.getState().open('perfil'); onClose(); }}
          className="w-full p-3 text-left text-sm text-lc-white hover:bg-lc-border/50 transition flex items-center gap-2"
          data-testid="open-settings-btn"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          Editar perfil
        </button>

        <div className="border-t border-lc-border" />

        {/* Logout */}
        <button
          onClick={onLogout}
          className="w-full p-3 text-left text-xs text-red-400 hover:bg-lc-border/50 transition flex items-center gap-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          {t('profile.logout')}
        </button>
      </div>
    </>,
    document.body,
  );
}
