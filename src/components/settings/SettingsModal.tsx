'use client';

import { type ReactNode, useEffect, useState, useCallback } from 'react';
import { useSettingsStore, SettingsSection } from '@/store/settings';
import InlineProfileEditor from './InlineProfileEditor';
import AppearanceSection from './AppearanceSection';
import AccountSection from './AccountSection';
import WalletPanel from '@/components/wallet/WalletPanel';
import ActivityCard from '@/components/profile/ActivityCard';
import MyInvitationsList from '@/components/invites/MyInvitationsList';
import { useAuthStore } from '@/store/auth';
import NotificationsSection from './NotificationsSection';

interface SidebarItem {
  id: SettingsSection;
  label: string;
  icon: ReactNode;
}

const ICONS = {
  perfil: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
  ),
  apariencia: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.8 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16c3.3 0 6-2.7 6-6 0-5-4.5-9-10-9z"/></svg>
  ),
  wallet: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z"/></svg>
  ),
  invitaciones: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
  ),
  actividad: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
  ),
  cuenta: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
  ),
  notifications: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
  ),
};

const ITEMS: SidebarItem[] = [
  { id: 'perfil', label: 'Perfil', icon: ICONS.perfil },
  { id: 'apariencia', label: 'Apariencia', icon: ICONS.apariencia },
  { id: 'wallet', label: 'Wallet', icon: ICONS.wallet },
  { id: 'invitaciones', label: 'Invitaciones', icon: ICONS.invitaciones },
  { id: 'actividad', label: 'Actividad', icon: ICONS.actividad },
  { id: 'cuenta', label: 'Cuenta', icon: ICONS.cuenta },
  { id: 'notifications', label: 'Notifications', icon: ICONS.notifications },
];

interface ProfileData {
  pubkey: string;
  servers: Array<{ serverId: string; serverName: string; joinedAt: string; lastActivityAt: string | null }>;
  invitations: Parameters<typeof MyInvitationsList>[0]['invitations'];
}

export default function SettingsModal() {
  const isOpen = useSettingsStore((s) => s.isOpen);
  const section = useSettingsStore((s) => s.section);
  const setSection = useSettingsStore((s) => s.setSection);
  const close = useSettingsStore((s) => s.close);
  const profile = useAuthStore((s) => s.profile);

  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/profile/me');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    if (!data && (section === 'invitaciones' || section === 'actividad')) loadProfile();
  }, [isOpen, section, data, loadProfile]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, close]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm p-10 md:p-24 flex items-stretch justify-stretch"
      data-testid="settings-modal"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
    <div className="relative flex w-full rounded-2xl overflow-hidden border border-lc-border shadow-2xl bg-lc-black">
      {/* Close button — red circular, top-right of the card (Discord-style) */}
      <button
        onClick={close}
        className="absolute top-5 right-5 z-10 w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30 flex items-center justify-center transition-colors ring-2 ring-red-500/30 hover:ring-red-500/60"
        aria-label="Cerrar"
        data-testid="settings-modal-close-top"
        title="Cerrar (Esc)"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      {/* Sidebar */}
      <aside className="w-64 shrink-0 bg-lc-dark border-r border-lc-border flex flex-col">
        <div className="px-5 py-5 border-b border-lc-border">
          <div className="text-[10px] uppercase tracking-wider text-lc-muted font-semibold mb-2">Ajustes de usuario</div>
          <div className="flex items-center gap-2 min-w-0">
            {profile?.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.picture} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-sm font-semibold shrink-0">
                {(profile?.displayName || profile?.name || '?')[0].toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm text-lc-white truncate">{profile?.displayName || profile?.name || 'Anon'}</div>
              {profile?.nip05 && <div className="text-[10px] text-lc-green truncate">{profile.nip05}</div>}
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {ITEMS.map((it) => (
            <button
              key={it.id}
              onClick={() => setSection(it.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors mb-0.5 ${
                section === it.id ? 'bg-lc-green/15 text-lc-green' : 'text-lc-white hover:bg-lc-border/40'
              }`}
              data-testid={`settings-modal-tab-${it.id}`}
            >
              <span className={section === it.id ? 'text-lc-green' : 'text-lc-muted'}>{it.icon}</span>
              <span>{it.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-10 py-10">
          <div className="mb-6">
            <div className="text-xs uppercase tracking-wider text-lc-muted font-semibold">
              {ITEMS.find((i) => i.id === section)?.label}
            </div>
          </div>

          {section === 'perfil' && <InlineProfileEditor />}
          {section === 'apariencia' && <AppearanceSection />}
          {section === 'cuenta' && <AccountSection />}
          {section === 'wallet' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lc-white text-xl font-semibold">Wallet</h2>
                <p className="text-sm text-lc-muted mt-1">
                  Conectá tu endpoint NWC para enviar y recibir zaps dentro de Obelisk.
                </p>
              </div>
              <WalletPanel />
            </div>
          )}
          {section === 'invitaciones' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lc-white text-xl font-semibold">Invitaciones</h2>
                <p className="text-sm text-lc-muted mt-1">Códigos que podés generar en tus servidores.</p>
              </div>
              {loading ? <div className="lc-spinner" /> : data ? (
                <MyInvitationsList invitations={data.invitations} />
              ) : null}
            </div>
          )}
          {section === 'notifications' && <NotificationsSection />}
          {section === 'actividad' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lc-white text-xl font-semibold">Actividad</h2>
                <p className="text-sm text-lc-muted mt-1">Tus servidores y tiempo de membresía.</p>
              </div>
              {loading ? <div className="lc-spinner" /> : data ? (
                data.servers.length === 0 ? (
                  <p className="text-sm text-lc-muted">Todavía no sos miembro de ningún servidor.</p>
                ) : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {data.servers.map((s) => (
                      <ActivityCard
                        key={s.serverId}
                        serverName={s.serverName}
                        joinedAt={s.joinedAt}
                        lastActivityAt={s.lastActivityAt}
                      />
                    ))}
                  </div>
                )
              ) : null}
            </div>
          )}
        </div>
      </main>
    </div>
    </div>
  );
}
