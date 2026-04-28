'use client';

import { useState } from 'react';

interface CreateServerModalProps {
  onClose: () => void;
  onCreate: (server: { id: string; name: string; icon: string | null; banner: string | null }) => void;
}

export default function CreateServerModal({ onClose, onCreate }: CreateServerModalProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [joinServerId, setJoinServerId] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create server');
        return;
      }
      const server = await res.json();
      onCreate(server);
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!joinServerId.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/servers/${joinServerId.trim()}/join`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to join server');
        return;
      }
      const data = await res.json();
      onCreate(data.server);
      onClose();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-lc-dark border border-lc-border rounded-xl p-6 max-w-sm w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tab switcher */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('create')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'create' ? 'bg-lc-green/20 text-lc-green' : 'text-lc-muted hover:text-lc-white'
            }`}
          >
            Create
          </button>
          <button
            onClick={() => setMode('join')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === 'join' ? 'bg-lc-green/20 text-lc-green' : 'text-lc-muted hover:text-lc-white'
            }`}
          >
            Join
          </button>
        </div>

        {mode === 'create' ? (
          <>
            <h3 className="text-lc-white text-lg font-semibold mb-3">Create a Server</h3>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Server name"
              className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none mb-3"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
              data-testid="server-name-input"
            />
          </>
        ) : (
          <>
            <h3 className="text-lc-white text-lg font-semibold mb-3">Join a Server</h3>
            <input
              type="text"
              value={joinServerId}
              onChange={(e) => setJoinServerId(e.target.value)}
              placeholder="Server ID or invite code"
              className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none mb-3"
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              autoFocus
              data-testid="server-join-input"
            />
          </>
        )}

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-sm text-lc-muted border border-lc-border hover:border-lc-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={mode === 'create' ? handleCreate : handleJoin}
            disabled={loading || (mode === 'create' ? !name.trim() : !joinServerId.trim())}
            className="lc-pill-primary px-5 py-2 text-sm font-medium disabled:opacity-50"
            data-testid="server-submit-btn"
          >
            {loading ? 'Loading...' : mode === 'create' ? 'Create' : 'Join'}
          </button>
        </div>
      </div>
    </div>
  );
}
