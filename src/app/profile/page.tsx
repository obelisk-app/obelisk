'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import ActivityCard from '@/components/profile/ActivityCard';
import MyInvitationsList from '@/components/invites/MyInvitationsList';
import WalletPanel from '@/components/wallet/WalletPanel';
import InlineProfileEditor from '@/components/settings/InlineProfileEditor';
import AppearanceSection from '@/components/settings/AppearanceSection';

type SectionId = 'perfil' | 'apariencia' | 'wallet' | 'invitaciones' | 'actividad';

interface ProfileServer {
  serverId: string;
  serverName: string;
  serverIcon: string | null;
  role: string;
  joinedAt: string;
  lastActivityAt: string | null;
  displayName: string | null;
  nickname: string | null;
  picture: string | null;
  nip05: string | null;
  about: string | null;
  canMintInvites: boolean;
}

interface ProfileData {
  pubkey: string;
  servers: ProfileServer[];
  invitations: Parameters<typeof MyInvitationsList>[0]['invitations'];
}

const SECTIONS: { id: SectionId; label: string; icon: string }[] = [
  { id: 'perfil', label: 'Perfil', icon: '👤' },
  { id: 'apariencia', label: 'Apariencia', icon: '🎨' },
  { id: 'wallet', label: 'Wallet', icon: '⚡' },
  { id: 'invitaciones', label: 'Invitaciones', icon: '✉️' },
  { id: 'actividad', label: 'Actividad', icon: '📊' },
];

export default function ProfilePage() {
  const router = useRouter();
  const params = useSearchParams();
  const initial = (params.get('tab') as SectionId) || 'perfil';
  const [active, setActive] = useState<SectionId>(
    SECTIONS.some((s) => s.id === initial) ? initial : 'perfil',
  );
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/profile/me');
    if (res.status === 401) { router.push('/'); return; }
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const selectTab = (id: SectionId) => {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', id);
    window.history.replaceState({}, '', url.toString());
  };

  if (loading) {
    return <div className="h-screen flex items-center justify-center bg-lc-black"><div className="lc-spinner" /></div>;
  }
  if (!data) return null;

  return (
    <div className="min-h-screen bg-lc-black">
      <div className="border-b border-lc-border bg-lc-dark sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (window.history.length > 1) router.back();
                else router.push('/chat');
              }}
              className="text-lc-muted hover:text-lc-white text-sm"
            >
              &larr; Volver
            </button>
            <h1 className="text-xl font-bold text-lc-white">Ajustes</h1>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <aside className="lg:w-56 shrink-0">
          <nav className="lc-card p-2 lg:sticky lg:top-24 flex lg:flex-col flex-row overflow-x-auto lg:overflow-visible">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => selectTab(s.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                  active === s.id
                    ? 'bg-lc-green/15 text-lc-green'
                    : 'text-lc-white hover:bg-lc-border/40'
                }`}
                data-testid={`settings-tab-${s.id}`}
              >
                <span className="text-base">{s.icon}</span>
                <span>{s.label}</span>
              </button>
            ))}
          </nav>
          <div className="mt-4 lc-card p-3 text-[10px] text-lc-muted break-all">
            <div className="uppercase tracking-wider mb-1">Tu pubkey</div>
            <div className="font-mono">{data.pubkey}</div>
          </div>
        </aside>

        {/* Content pane */}
        <main className="flex-1 min-w-0 space-y-6">
          {active === 'perfil' && <InlineProfileEditor />}
          {active === 'apariencia' && <AppearanceSection />}
          {active === 'wallet' && (
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
          {active === 'invitaciones' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lc-white text-xl font-semibold">Invitaciones</h2>
                <p className="text-sm text-lc-muted mt-1">
                  Códigos que podés generar en los servidores donde tenés crédito.
                </p>
              </div>
              <MyInvitationsList invitations={data.invitations} />
            </div>
          )}
          {active === 'actividad' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-lc-white text-xl font-semibold">Actividad</h2>
                <p className="text-sm text-lc-muted mt-1">Tus servidores y tiempo de membresía.</p>
              </div>
              {data.servers.length === 0 ? (
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
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
