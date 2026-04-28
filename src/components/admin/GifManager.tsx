'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface AdminGif {
  id: string;
  name: string;
  url: string;
  tags: string;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  uploadedBy: string;
  createdAt: string;
}

interface GifManagerProps {
  serverId: string;
}

// Match the server's image-MIME allowlist. GIFs are the primary target here
// but we accept any image type because "reaction GIFs" are often WebP/MP4 now
// — this keeps the library useful without forcing re-encoding. Videos are
// rejected to keep the picker lightweight (users can still attach videos
// through the normal upload flow).
const ACCEPT = 'image/gif,image/webp,image/png,image/jpeg';
// Per-file cap for library entries. Loose enough for animated content but
// tight enough that the picker stays snappy on mobile.
const MAX_GIF_BYTES = 8 * 1024 * 1024;
const NAME_MIN = 2;
const NAME_MAX = 64;

/**
 * Derive a reasonable library-entry name from a filename. Strips the extension
 * and collapses underscores/dashes to spaces so the human-facing label reads
 * naturally. Returned as Title-Cased text — users can still override.
 */
function suggestNameFromFile(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  return base
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NAME_MAX);
}

/**
 * Read an image file into a 2D <img> to extract natural width/height. Returns
 * null on decode failure so the caller can still register the GIF without
 * dimensions. Used purely as metadata for the picker layout — not critical.
 */
function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/**
 * Mod+ admin UI for managing the server's curated GIF library. Upload → name
 * → tags → POST, delete → remove. Mirrors `EmojiManager` but with a richer
 * row (thumbnail + tags + dimensions) because GIFs are typically browsed as
 * a visual grid rather than hunted by exact name.
 */
export default function GifManager({ serverId }: GifManagerProps) {
  const [gifs, setGifs] = useState<AdminGif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchGifs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/gifs?serverId=${encodeURIComponent(serverId)}`);
      if (res.ok) {
        const data = await res.json();
        setGifs(data.gifs || []);
      }
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => {
    fetchGifs();
  }, [fetchGifs]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError('Select an image/GIF file');
      return;
    }
    if (file.size > MAX_GIF_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setError(`File is ${mb} MB — limit is 8 MB. Shrink or re-encode first.`);
      return;
    }
    const cleanName = name.trim();
    if (cleanName.length < NAME_MIN || cleanName.length > NAME_MAX) {
      setError(`Name must be ${NAME_MIN}–${NAME_MAX} characters`);
      return;
    }
    setSaving(true);
    try {
      // 1) Probe dimensions locally — done before upload so we can store them
      //    alongside the row without a second round-trip on the server. Falls
      //    through to null on decode failure (e.g. exotic GIF variants).
      const dims = await readImageDimensions(file);

      // 2) Upload the file to /api/upload (scoped to this server so per-server
      //    limits apply — owners can cap uploads separately).
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

      // 3) Register the GIF with the admin route.
      const reg = await fetch(`/api/admin/gifs?serverId=${encodeURIComponent(serverId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          url,
          tags,
          width: dims?.width,
          height: dims?.height,
          sizeBytes: file.size,
        }),
      });
      if (!reg.ok) {
        const body = await reg.json().catch(() => ({}));
        setError(body?.error || `Register failed (${reg.status})`);
        return;
      }
      // Success — reset the form and refresh the list.
      setName('');
      setTags('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchGifs();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this GIF?')) return;
    const res = await fetch(
      `/api/admin/gifs?serverId=${encodeURIComponent(serverId)}&id=${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
    if (res.ok) {
      setGifs((prev) => prev.filter((g) => g.id !== id));
    }
  };

  return (
    <div className="space-y-6" data-testid="gif-manager">
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-lc-border bg-lc-dark/40 p-5 space-y-4"
      >
        <h3 className="text-sm font-semibold text-lc-white">Upload a GIF to the library</h3>
        <div className="flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
              setError(null);
              if (f && !name.trim()) {
                const suggested = suggestNameFromFile(f.name);
                if (suggested.length >= NAME_MIN) setName(suggested);
              }
            }}
            className="text-xs text-lc-muted file:mr-3 file:px-3 file:py-1.5 file:rounded-full file:border-0 file:bg-lc-border file:text-lc-white file:text-xs file:cursor-pointer"
            data-testid="gif-file-input"
          />
          <div className="flex gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
              placeholder="Name (e.g. Happy Dance)"
              maxLength={NAME_MAX}
              className="flex-1 px-3 py-1.5 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
              data-testid="gif-name-input"
            />
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Tags: happy, dance, celebration"
              className="flex-1 px-3 py-1.5 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none"
              data-testid="gif-tags-input"
            />
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-1.5 rounded-full bg-lc-green text-lc-black font-semibold text-xs hover:brightness-110 transition disabled:opacity-50"
              data-testid="gif-submit"
            >
              {saving ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>
        {error && (
          <p className="text-xs text-red-400" data-testid="gif-error">
            {error}
          </p>
        )}
        <p className="text-[11px] text-lc-muted">
          GIF, WebP, PNG, or JPEG up to 8 MB. Tags are comma-separated and used by the composer's search.
        </p>
      </form>

      <div className="rounded-xl border border-lc-border bg-lc-dark/40 overflow-hidden">
        <div className="px-5 py-3 border-b border-lc-border">
          <h3 className="text-sm font-semibold text-lc-white">
            GIF library {gifs.length > 0 && <span className="text-lc-muted font-normal">· {gifs.length}</span>}
          </h3>
        </div>
        {loading ? (
          <p className="text-sm text-lc-muted py-8 text-center">Loading…</p>
        ) : gifs.length === 0 ? (
          <p className="text-sm text-lc-muted py-8 text-center">No GIFs in the library yet</p>
        ) : (
          <ul className="divide-y divide-lc-border/60">
            {gifs.map((g) => (
              <li key={g.id} className="flex items-center gap-4 px-5 py-3" data-testid="gif-row">
                <img
                  src={g.url}
                  alt={g.name}
                  className="w-16 h-16 object-cover rounded bg-lc-black"
                  loading="lazy"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-lc-white font-medium truncate">{g.name}</p>
                  {g.tags && (
                    <p className="text-[11px] text-lc-green/70 truncate mt-0.5">
                      {g.tags.split(',').map((t) => `#${t}`).join(' ')}
                    </p>
                  )}
                  <p className="text-[11px] text-lc-muted truncate">
                    {g.width && g.height ? `${g.width}×${g.height}` : ''}
                    {g.sizeBytes ? ` · ${Math.round(g.sizeBytes / 1024)} KB` : ''}
                    {' · by '}{g.uploadedBy.slice(0, 8)}…
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(g.id)}
                  className="px-3 py-1 rounded-full border border-lc-border text-xs text-lc-muted hover:text-red-400 hover:border-red-400/40 transition"
                  data-testid="gif-delete"
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
