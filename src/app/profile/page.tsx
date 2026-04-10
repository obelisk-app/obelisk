'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ProfileHeader from '@/components/profile/ProfileHeader';
import ActivityCard from '@/components/profile/ActivityCard';
import MyInvitationsList from '@/components/invites/MyInvitationsList';

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

export default function ProfilePage() {
  const router = useRouter();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch('/api/profile/me');
    if (res.status === 401) {
      router.push('/');
      return;
    }
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-lc-black">
        <div className="lc-spinner" />
      </div>
    );
  }

  if (!data) return null;

  // Use the first server's cached profile data for the header.
  const headerSource = data.servers[0];

  return (
    <div className="min-h-screen bg-lc-black">
      <div className="border-b border-lc-border bg-lc-dark">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/chat')}
              className="text-lc-muted hover:text-lc-white transition-colors text-sm"
            >
              &larr; Back to chat
            </button>
            <h1 className="text-xl font-bold text-lc-white">My Profile</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        <ProfileHeader
          pubkey={data.pubkey}
          displayName={headerSource?.displayName ?? null}
          picture={headerSource?.picture ?? null}
          nip05={headerSource?.nip05 ?? null}
          about={headerSource?.about ?? null}
        />

        <section>
          <h2 className="text-sm font-semibold text-lc-white mb-3">Activity</h2>
          {data.servers.length === 0 ? (
            <p className="text-sm text-lc-muted">You're not a member of any server yet.</p>
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
        </section>

        <section>
          <h2 className="text-sm font-semibold text-lc-white mb-3">My invitations</h2>
          <MyInvitationsList invitations={data.invitations} />
        </section>
      </div>
    </div>
  );
}
