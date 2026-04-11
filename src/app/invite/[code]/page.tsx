'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import LoginModal from '@/components/LoginModal';

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
  const { isConnected, restoreSession } = useAuthStore();
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const pendingJoinRef = useRef(false);
  const sessionCheckStarted = useRef(false);

  // Restore session on mount so we know whether the user is already logged in.
  useEffect(() => {
    if (sessionCheckStarted.current) return;
    sessionCheckStarted.current = true;
    restoreSession().finally(() => setAuthChecked(true));
  }, [restoreSession]);

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

  const performJoin = async () => {
    setJoining(true);
    setError('');
    try {
      const res = await fetch(`/api/invitations/${code}`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          // Session expired or missing — prompt login.
          setShowLogin(true);
          return;
        }
        if (data.banned) {
          setError(
            data.reason
              ? `You are banned from this server. Reason: ${data.reason}`
              : 'You are banned from this server.'
          );
        } else {
          setError(data.error || 'Failed to join');
        }
        return;
      }

      if (data.alreadyMember) {
        // Already in — go straight to chat without re-consuming the invite.
        router.push('/chat');
        return;
      }

      router.push('/chat');
    } catch {
      setError('Network error');
    } finally {
      setJoining(false);
    }
  };

  const handleJoin = async () => {
    if (!isConnected) {
      // Not logged in — open the login modal and queue the join to run
      // automatically once authentication succeeds.
      pendingJoinRef.current = true;
      setShowLogin(true);
      return;
    }
    await performJoin();
  };

  const handleLoginSuccess = () => {
    setShowLogin(false);
    if (pendingJoinRef.current) {
      pendingJoinRef.current = false;
      void performJoin();
    }
  };

  if (loading || !authChecked) {
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

        {!isConnected && (
          <p className="text-xs text-lc-muted mb-3">
            You need to log in or create an account to accept this invitation.
          </p>
        )}

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          onClick={handleJoin}
          disabled={joining}
          className="lc-pill-primary px-6 py-2.5 text-sm font-medium w-full disabled:opacity-50"
          data-testid="accept-invite-btn"
        >
          {joining
            ? 'Joining...'
            : isConnected
            ? 'Accept Invite'
            : 'Log in to Accept Invite'}
        </button>
      </div>

      <LoginModal
        isOpen={showLogin}
        onClose={() => {
          setShowLogin(false);
          pendingJoinRef.current = false;
        }}
        onSuccess={handleLoginSuccess}
      />
    </div>
  );
}
