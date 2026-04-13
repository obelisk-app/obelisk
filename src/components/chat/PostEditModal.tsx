'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useChatStore } from '@/store/chat';

interface Props {
  postId: string;
  channelId: string;
  initialTitle: string;
  initialCoverImage: string | null;
  onClose: () => void;
  onSaved: (updated: { title: string; coverImage: string | null }) => void;
}

export default function PostEditModal({
  postId,
  channelId,
  initialTitle,
  initialCoverImage,
  onClose,
  onSaved,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [cover, setCover] = useState<string | null>(initialCoverImage);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeServerId = useChatStore((s) => s.activeServerId);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  const uploadImage = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append('file', file);
    const qs = activeServerId ? `?serverId=${encodeURIComponent(activeServerId)}` : '';
    try {
      const res = await fetch(`/api/upload${qs}`, { method: 'POST', body: fd });
      if (!res.ok) return null;
      const data = await res.json();
      return typeof data?.url === 'string' ? data.url : null;
    } catch { return null; }
  };

  const save = async () => {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/channels/${channelId}/posts/${postId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), coverImage: cover }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error || 'Failed to save');
        return;
      }
      const data = await res.json();
      const updated = {
        title: data.post?.title ?? title.trim(),
        coverImage: data.post?.coverImage ?? cover ?? null,
      };
      // Keep the sidebar's followed-post metadata in sync so the row shows
      // the new title instead of "Untitled".
      const state = useChatStore.getState();
      const existing = state.followedPostMeta[postId];
      if (existing) {
        useChatStore.setState({
          followedPostMeta: {
            ...state.followedPostMeta,
            [postId]: { ...existing, title: updated.title },
          },
        });
      }
      onSaved(updated);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
      data-testid="post-edit-modal"
    >
      <div
        className="bg-lc-dark border border-lc-border rounded-xl shadow-xl w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-lc-white">Edit post</h3>
          <button
            onClick={onClose}
            className="text-lc-muted hover:text-lc-white"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div>
          <label className="text-[10px] text-lc-muted uppercase tracking-wider mb-1 block">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-lc-black/60 border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white focus:outline-none focus:border-lc-green/50"
            data-testid="post-edit-title"
          />
        </div>

        <div>
          <label className="text-[10px] text-lc-muted uppercase tracking-wider mb-1 block">Cover image</label>
          {cover ? (
            <div className="relative inline-block">
              <img
                src={cover}
                alt=""
                className="max-h-40 rounded-lg border border-lc-border object-cover"
                data-testid="post-edit-cover-preview"
              />
              <button
                type="button"
                onClick={() => setCover(null)}
                aria-label="Remove cover"
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-lc-black border border-lc-border text-lc-muted hover:text-lc-white flex items-center justify-center"
                data-testid="post-edit-cover-remove"
              >
                ×
              </button>
            </div>
          ) : (
            <label
              className={`inline-flex items-center gap-2 text-xs text-lc-muted hover:text-lc-white border border-dashed border-lc-border rounded-lg px-3 py-2 cursor-pointer ${uploading ? 'opacity-60 pointer-events-none' : ''}`}
              data-testid="post-edit-cover-upload"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              {uploading ? 'Uploading...' : 'Upload image'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploading(true);
                  const url = await uploadImage(f);
                  setUploading(false);
                  if (url) setCover(url);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-lc-muted hover:text-lc-white"
            data-testid="post-edit-cancel"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !title.trim()}
            className="lc-pill-primary px-4 py-1.5 text-sm disabled:opacity-50"
            data-testid="post-edit-save"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
