'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /admin index — fetches the list of servers the current user can administer
 * and redirects to the first one. If they can't admin anything, shows access
 * denied. The "real" admin UI lives at /admin/[serverId].
 */
export default function AdminIndexPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/servers')
      .then((r) => {
        if (r.status === 401) {
          router.push('/');
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled || !data) return;
        const servers: { id: string }[] = data.servers ?? [];
        if (servers.length === 0) {
          setError('You do not have admin access to any server.');
          return;
        }
        router.replace(`/admin/${servers[0].id}`);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load servers.');
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-lc-black">
        <div className="text-center max-w-sm mx-4">
          <div className="w-16 h-16 rounded-full bg-red-600/10 flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-lc-white mb-2">Access Denied</h2>
          <p className="text-sm text-lc-muted mb-6">{error}</p>
          <button
            onClick={() => router.push('/chat')}
            className="lc-pill-primary px-6 py-2 text-sm font-medium"
          >
            Back to Chat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-lc-black">
      <div className="lc-spinner" data-testid="admin-loading" />
    </div>
  );
}
