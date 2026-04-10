'use client';

import { useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { useTranslation } from '@/i18n/context';

interface ProfilePanelProps {
  onClose: () => void;
  onLogout: () => void;
}

export default function ProfilePanel({ onClose, onLogout }: ProfilePanelProps) {
  const { profile } = useAuthStore();
  const { t } = useTranslation();
  const [nickname, setNickname] = useState('');
  const [nicknameLoaded, setNicknameLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  // Load current nickname from server on first render
  if (!nicknameLoaded) {
    setNicknameLoaded(true);
    fetch('/api/members/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(r => r.json())
      .then(data => { if (data.nickname) setNickname(data.nickname); })
      .catch(() => {});
  }

  const handleSyncNostr = async () => {
    setSyncing(true);
    setSyncStatus('idle');
    try {
      const res = await fetch('/api/members/me/sync-nostr', { method: 'POST' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      // Update auth store with fresh profile data
      const store = useAuthStore.getState();
      if (store.profile) {
        useAuthStore.setState({
          profile: {
            ...store.profile,
            displayName: data.displayName || store.profile.displayName,
            picture: data.picture || store.profile.picture,
            nip05: data.nip05 || store.profile.nip05,
            about: data.about || store.profile.about,
            banner: data.banner || store.profile.banner,
          },
        });
      }
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveNickname = async () => {
    setSaving(true);
    try {
      await fetch('/api/members/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname || null }),
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return null;

  const displayName = profile.displayName || profile.name || 'Anon';

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Panel — positioned above the UserPanel, bottom-left */}
      <div className="absolute bottom-full left-0 mb-2 w-72 bg-lc-dark border border-lc-border rounded-xl shadow-2xl overflow-hidden z-50">
        {/* Banner area */}
        {profile.banner ? (
          <div className="h-20 overflow-hidden relative">
            <img src={profile.banner} alt="" className="w-full h-full object-cover opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-lc-dark" />
          </div>
        ) : (
          <div className="h-12 bg-gradient-to-r from-lc-olive/30 to-lc-dark" />
        )}

        {/* Avatar + name */}
        <div className="px-4 -mt-6 relative">
          {profile.picture ? (
            <img
              src={profile.picture}
              alt={displayName}
              className="w-14 h-14 rounded-full object-cover ring-4 ring-lc-dark"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-lg font-semibold ring-4 ring-lc-dark">
              {displayName[0].toUpperCase()}
            </div>
          )}
          <div className="mt-2">
            <div className="text-sm font-semibold text-lc-white">{displayName}</div>
            {profile.nip05 && (
              <div className="text-xs text-lc-green truncate">{profile.nip05}</div>
            )}
            <div className="text-[10px] text-lc-muted font-mono mt-0.5 truncate">
              {profile.npub ? `${profile.npub.slice(0, 20)}...` : ''}
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

        {/* Nostr section — read only + sync button */}
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-lc-muted font-semibold mb-2">
            {t('profile.nostrSection')}
          </div>
          <button
            onClick={handleSyncNostr}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-lc-border/50 text-lc-white hover:bg-lc-border transition disabled:opacity-50"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={syncing ? 'animate-spin' : ''}>
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.3"/>
            </svg>
            {syncing ? t('profile.syncing') : t('profile.syncFromNostr')}
          </button>
          {syncStatus === 'success' && (
            <div className="text-[10px] text-lc-green mt-1 text-center">{t('profile.syncSuccess')}</div>
          )}
          {syncStatus === 'error' && (
            <div className="text-[10px] text-red-400 mt-1 text-center">{t('profile.syncError')}</div>
          )}
        </div>

        <div className="border-t border-lc-border" />

        {/* Obelisk section — editable nickname */}
        <div className="px-4 py-3">
          <div className="text-[10px] uppercase tracking-wider text-lc-muted font-semibold mb-2">
            {t('profile.obeliskSection')}
          </div>
          <label className="text-xs text-lc-muted">{t('profile.nickname')}</label>
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={t('profile.nicknamePlaceholder')}
              maxLength={32}
              className="flex-1 bg-lc-black border border-lc-border rounded-lg px-2 py-1 text-xs text-lc-white placeholder:text-lc-muted/50 focus:outline-none focus:border-lc-green/50"
            />
            <button
              onClick={handleSaveNickname}
              disabled={saving}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-lc-green/20 text-lc-green hover:bg-lc-green/30 transition disabled:opacity-50"
            >
              {saveStatus === 'saved' ? t('profile.saved') : t('profile.save')}
            </button>
          </div>
        </div>

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
    </>
  );
}
