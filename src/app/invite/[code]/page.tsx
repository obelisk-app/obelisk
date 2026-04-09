'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface ServerInfo {
  id: string;
  name: string;
  icon: string | null;
  banner: string | null;
  _count: { members: number };
}

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetch(`/api/invitations/${code}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Invalid invitation');
          return;
        }
        const data = await res.json();
        setServer(data.server);
      })
      .catch(() => setError('Failed to load invitation'))
      .finally(() => setLoading(false));
  }, [code]);

  const handleJoin = async () => {
    setJoining(true);
    setError('');
    try {
      const res = await fetch(`/api/invitations/${code}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to join');
        return;
      }
      router.push('/chat');
    } catch {
      setError('Network error');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-lc-black">
        <div className="lc-spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  if (error && !server) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-lc-black">
        <div className="lc-card p-6 max-w-sm text-center">
          <h2 className="text-lg font-semibold text-lc-white mb-2">Invalid Invitation</h2>
          <p className="text-sm text-lc-muted mb-4">{error}</p>
          <button onClick={() => router.push('/')} className="lc-pill-primary px-5 py-2 text-sm">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-lc-black">
      <div className="lc-card p-6 max-w-sm w-full mx-4 text-center">
        {server?.icon ? (
          <img src={server.icon} alt={server.name} className="w-16 h-16 rounded-full mx-auto mb-4 object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-lc-green/20 flex items-center justify-center mx-auto mb-4">
            <span className="text-lc-green font-bold text-xl">{server?.name.slice(0, 2).toUpperCase()}</span>
          </div>
        )}
        <h2 className="text-xl font-bold text-lc-white mb-1">{server?.name}</h2>
        <p className="text-sm text-lc-muted mb-4">{server?._count.members} members</p>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          onClick={handleJoin}
          disabled={joining}
          className="lc-pill-primary px-6 py-2.5 text-sm font-medium w-full disabled:opacity-50"
          data-testid="accept-invite-btn"
        >
          {joining ? 'Joining...' : 'Accept Invite'}
        </button>
      </div>
    </div>
  );
}
