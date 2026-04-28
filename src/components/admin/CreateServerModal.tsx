'use client';

import { useState } from 'react';

interface CreateServerModalProps {
  onClose: () => void;
  onCreated: (server: { id: string; name: string }) => void;
}

/**
 * Modal for creating a new server from the admin panel. Hits POST /api/servers
 * which is gated to instance owner or existing server owners.
 */
export default function CreateServerModal({ onClose, onCreated }: CreateServerModalProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), icon: icon.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Failed to create server');
        return;
      }
      onCreated({ id: data.id, name: data.name });
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="create-server-modal"
    >
      <div
        className="bg-lc-dark border border-lc-border rounded-2xl shadow-2xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-lc-white">Create Server</h2>
          <button
            onClick={onClose}
            className="text-lc-muted hover:text-lc-white text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-lc-muted mb-1.5 uppercase tracking-wider">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
              maxLength={64}
              placeholder="My new server"
              className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none transition-colors"
              data-testid="create-server-name"
            />
          </div>

          <div>
            <label className="block text-xs text-lc-muted mb-1.5 uppercase tracking-wider">
              Icon URL <span className="text-lc-muted normal-case">(optional)</span>
            </label>
            <input
              type="url"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="https://example.com/icon.png"
              className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none transition-colors"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400" data-testid="create-server-error">
              {error}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-sm font-medium border border-lc-border text-lc-muted hover:text-lc-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="px-5 py-2 rounded-full bg-lc-green text-lc-black font-semibold text-sm hover:brightness-110 transition disabled:opacity-50"
              data-testid="create-server-submit"
            >
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
