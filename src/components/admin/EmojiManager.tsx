'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface ServerEmoji {
  id: string;
  name: string;
  url: string;
  createdBy: string;
  createdAt: string;
}

interface EmojiManagerProps {
  serverId: string;
}

const NAME_REGEX = /^[a-z0-9_-]{2,32}$/;

/**
 * Mod+ admin UI for managing custom per-server emojis. Upload → name → POST,
 * delete → remove. Follows the same pattern as `ChannelManager`: a
 * top-of-form area plus a list below.
 */
export default function EmojiManager({ serverId }: EmojiManagerProps) {
  const [emojis, setEmojis] = useState<ServerEmoji[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEmojis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/emojis?serverId=${encodeURIComponent(serverId)}`);
      if (res.ok) {
        const data = await res.json();
        setEmojis(data.emojis || []);
      }
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchEmojis();
  }, [fetchEmojis]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError('Select an image file');
      return;
    }
    const cleanName = name.trim().toLowerCase();
    if (!NAME_REGEX.test(cleanName)) {
      setError('Name must be 2–32 lowercase letters, digits, _ or -');
      return;
    }
    setSaving(true);
    try {
      // 1) Upload the image to /api/upload (scoped to this server so per-server
      //    limits apply — owners can cap emoji uploads separately).
      const fd = new FormData();
      fd.append('file', file);
      const up = await fetch(
        `/api/upload?serverId=${encodeURIComponent(serverId)}`,
        { method: 'POST', body: fd },
      );
      if (!up.ok) {
        const body = await up.json().catch(() => ({}));
        setError(body?.error || `Upload failed (${up.status})`);
        return;
      }
      const { url } = await up.json();

      // 2) Register the emoji with the admin route.
      const reg = await fetch(`/api/admin/emojis?serverId=${encodeURIComponent(serverId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName, url }),
      });
      if (!reg.ok) {
        const body = await reg.json().catch(() => ({}));
        setError(body?.error || `Register failed (${reg.status})`);
        return;
      }
      // Success — reset the form and refresh the list.
      setName('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchEmojis();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this emoji?')) return;
    const res = await fetch(
      `/api/admin/emojis?serverId=${encodeURIComponent(serverId)}&id=${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
    if (res.ok) {
      setEmojis((prev) => prev.filter((e) => e.id !== id));
    }
  };

  return (
    <div className="space-y-6" data-testid="emoji-manager">
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-lc-border bg-lc-dark/40 p-5 space-y-4"
      >
        <h3 className="text-sm font-semibold text-lc-white">Upload a custom emoji</h3>
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-xs text-lc-muted file:mr-3 file:px-3 file:py-1.5 file:rounded-full file:border-0 file:bg-lc-border file:text-lc-white file:text-xs file:cursor-pointer"
            data-testid="emoji-file-input"
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder=":name:"
            pattern="[a-z0-9_\-]{2,32}"
            className="flex-1 px-3 py-1.5 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
            data-testid="emoji-name-input"
          />
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-1.5 rounded-full bg-lc-green text-lc-black font-semibold text-xs hover:brightness-110 transition disabled:opacity-50"
            data-testid="emoji-submit"
          >
            {saving ? 'Uploading…' : 'Upload'}
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-400" data-testid="emoji-error">
            {error}
          </p>
        )}
        <p className="text-[11px] text-lc-muted">
          PNG, JPEG, GIF, or WebP. Recommended: ≤ 128×128 px, ≤ 256 KB.
        </p>
      </form>

      <div className="rounded-xl border border-lc-border bg-lc-dark/40 overflow-hidden">
        <div className="px-5 py-3 border-b border-lc-border">
          <h3 className="text-sm font-semibold text-lc-white">
            Server emojis {emojis.length > 0 && <span className="text-lc-muted font-normal">· {emojis.length}</span>}
          </h3>
        </div>
        {loading ? (
          <p className="text-sm text-lc-muted py-8 text-center">Loading…</p>
        ) : emojis.length === 0 ? (
          <p className="text-sm text-lc-muted py-8 text-center">No custom emojis yet</p>
        ) : (
          <ul className="divide-y divide-lc-border/60">
            {emojis.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-5 py-3" data-testid="emoji-row">
                <img src={e.url} alt={e.name} className="w-8 h-8 object-contain rounded bg-lc-black" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-lc-white font-medium">:{e.name}:</p>
                  <p className="text-[11px] text-lc-muted truncate">
                    by {e.createdBy.slice(0, 8)}… · {new Date(e.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(e.id)}
                  className="px-3 py-1 rounded-full border border-lc-border text-xs text-lc-muted hover:text-red-400 hover:border-red-400/40 transition"
                  data-testid="emoji-delete"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
