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
const MAX_EMOJI_BYTES_STATIC = 256 * 1024;
const MAX_EMOJI_BYTES_GIF = 2 * 1024 * 1024;

function maxBytesForEmoji(mime: string): number {
  return mime === 'image/gif' ? MAX_EMOJI_BYTES_GIF : MAX_EMOJI_BYTES_STATIC;
}

function suggestNameFromFile(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '');
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return cleaned.length >= 2 ? cleaned : '';
}

type BulkRow = {
  file: File;
  name: string;
  status: 'pending' | 'uploading' | 'done' | 'skipped' | 'error';
  message?: string;
};

export default function EmojiManager({ serverId }: EmojiManagerProps) {
  const [emojis, setEmojis] = useState<ServerEmoji[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const bulkInputRef = useRef<HTMLInputElement>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

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
    const cap = maxBytesForEmoji(file.type);
    if (file.size > cap) {
      const kb = Math.round(file.size / 1024);
      const capKb = Math.round(cap / 1024);
      setError(`File is ${kb} KB — limit is ${capKb} KB for ${file.type || 'this type'}. Shrink the image first.`);
      return;
    }
    const cleanName = name.trim().toLowerCase();
    if (!NAME_REGEX.test(cleanName)) {
      setError('Name must be 2–32 characters: letters, digits, _ or -');
      return;
    }
    setSaving(true);
    try {
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
      setName('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchEmojis();
    } finally {
      setSaving(false);
    }
  };

  const handleBulkSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const rows: BulkRow[] = [];
    const seen = new Set<string>();
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('image/')) continue;
      let suggested = suggestNameFromFile(f.name);
      let candidate = suggested || 'emoji';
      let n = 2;
      while (seen.has(candidate)) candidate = `${suggested || 'emoji'}_${n++}`;
      seen.add(candidate);
      rows.push({ file: f, name: candidate, status: 'pending' });
    }
    setBulkRows(rows);
  };

  const updateBulkRow = (idx: number, patch: Partial<BulkRow>) => {
    setBulkRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const handleBulkUpload = async () => {
    setBulkRunning(true);
    try {
      for (let i = 0; i < bulkRows.length; i++) {
        const row = bulkRows[i];
        if (row.status === 'done' || row.status === 'skipped') continue;

        const cleanName = row.name.trim().toLowerCase();
        if (!NAME_REGEX.test(cleanName)) {
          updateBulkRow(i, { status: 'error', message: 'invalid name' });
          continue;
        }
        const cap = maxBytesForEmoji(row.file.type);
        if (row.file.size > cap) {
          updateBulkRow(i, {
            status: 'error',
            message: `too large (${Math.round(row.file.size / 1024)} KB)`,
          });
          continue;
        }

        updateBulkRow(i, { status: 'uploading', message: undefined });
        try {
          const fd = new FormData();
          fd.append('file', row.file);
          const up = await fetch(
            `/api/upload?serverId=${encodeURIComponent(serverId)}`,
            { method: 'POST', body: fd },
          );
          if (!up.ok) {
            const body = await up.json().catch(() => ({}));
            updateBulkRow(i, { status: 'error', message: body?.error || `upload ${up.status}` });
            continue;
          }
          const { url } = await up.json();
          const reg = await fetch(
            `/api/admin/emojis?serverId=${encodeURIComponent(serverId)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: cleanName, url }),
            },
          );
          if (reg.status === 409) {
            updateBulkRow(i, { status: 'skipped', message: 'name already exists' });
            continue;
          }
          if (!reg.ok) {
            const body = await reg.json().catch(() => ({}));
            updateBulkRow(i, { status: 'error', message: body?.error || `register ${reg.status}` });
            continue;
          }
          updateBulkRow(i, { status: 'done', message: undefined });
        } catch (err) {
          updateBulkRow(i, {
            status: 'error',
            message: err instanceof Error ? err.message : 'failed',
          });
        }
      }
      await fetchEmojis();
    } finally {
      setBulkRunning(false);
    }
  };

  const clearBulk = () => {
    setBulkRows([]);
    if (bulkInputRef.current) bulkInputRef.current.value = '';
  };

  const startEdit = (emoji: ServerEmoji) => {
    setEditingId(emoji.id);
    setEditingName(emoji.name);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
    setEditError(null);
  };

  const saveEdit = async (id: string) => {
    const cleanName = editingName.trim().toLowerCase();
    if (!NAME_REGEX.test(cleanName)) {
      setEditError('2–32 chars: a-z, 0-9, _ or -');
      return;
    }
    const res = await fetch(
      `/api/admin/emojis?serverId=${encodeURIComponent(serverId)}&id=${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: cleanName }),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setEditError(body?.error || `Rename failed (${res.status})`);
      return;
    }
    const data = await res.json();
    setEmojis((prev) =>
      prev.map((e) => (e.id === id ? { ...e, name: data.emoji?.name ?? cleanName } : e)),
    );
    cancelEdit();
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

  const pendingCount = bulkRows.filter(
    (r) => r.status === 'pending' || r.status === 'error',
  ).length;

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
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setFile(f);
              setError(null);
              if (f && !name.trim()) {
                const suggested = suggestNameFromFile(f.name);
                if (suggested) setName(suggested);
              }
            }}
            className="sr-only"
            data-testid="emoji-file-input"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-lc-border bg-lc-black text-lc-white text-xs hover:border-lc-green hover:text-lc-green transition shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {file ? 'Change image' : 'Choose image'}
          </button>
          {file && (
            <span className="text-[11px] text-lc-muted truncate max-w-[140px]" title={file.name}>
              {file.name}
            </span>
          )}
          <input
            type="text"
            value={name}
            onChange={(e) => {
              const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
              setName(cleaned.slice(0, 32));
            }}
            placeholder="name"
            maxLength={32}
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
          PNG, JPEG, WebP up to 256 KB · animated GIF up to 2 MB. Recommended: ≤ 128×128 px.
        </p>
      </form>

      <div className="rounded-xl border border-lc-border bg-lc-dark/40 p-5 space-y-4" data-testid="emoji-bulk">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-lc-white">Bulk upload</h3>
          {bulkRows.length > 0 && (
            <button
              type="button"
              onClick={clearBulk}
              disabled={bulkRunning}
              className="text-xs text-lc-muted hover:text-lc-white disabled:opacity-50"
            >
              Clear
            </button>
          )}
        </div>
        <input
          ref={bulkInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          onChange={(e) => handleBulkSelect(e.target.files)}
          className="sr-only"
          data-testid="emoji-bulk-input"
        />
        <button
          type="button"
          onClick={() => bulkInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleBulkSelect(e.dataTransfer.files);
          }}
          className={
            'w-full flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed transition cursor-pointer ' +
            (dragOver
              ? 'border-lc-green bg-lc-green/5'
              : 'border-lc-border bg-lc-black hover:border-lc-green/60')
          }
          data-testid="emoji-bulk-dropzone"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={dragOver ? 'text-lc-green' : 'text-lc-muted'}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className="text-sm text-lc-white font-medium">
            {dragOver ? 'Drop to add' : 'Drop images here or click to select'}
          </span>
          <span className="text-[11px] text-lc-muted">
            Multiple files or a folder · names auto-derive from filenames · duplicates are skipped
          </span>
        </button>

        {bulkRows.length > 0 && (
          <>
            <ul className="divide-y divide-lc-border/60 max-h-80 overflow-auto">
              {bulkRows.map((row, idx) => (
                <li
                  key={`${row.file.name}-${idx}`}
                  className="flex items-center gap-3 py-2"
                  data-testid="emoji-bulk-row"
                >
                  <img
                    src={URL.createObjectURL(row.file)}
                    alt=""
                    className="w-8 h-8 object-contain rounded bg-lc-black shrink-0"
                  />
                  <input
                    type="text"
                    value={row.name}
                    disabled={bulkRunning || row.status === 'done' || row.status === 'skipped'}
                    onChange={(e) => {
                      const cleaned = e.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9_-]/g, '')
                        .slice(0, 32);
                      updateBulkRow(idx, { name: cleaned });
                    }}
                    className="flex-1 px-2 py-1 rounded bg-lc-black border border-lc-border text-lc-white text-xs focus:border-lc-green focus:outline-none disabled:opacity-60"
                  />
                  <span
                    className={
                      'text-[11px] w-28 text-right ' +
                      (row.status === 'done'
                        ? 'text-lc-green'
                        : row.status === 'error'
                        ? 'text-red-400'
                        : row.status === 'skipped'
                        ? 'text-yellow-400'
                        : 'text-lc-muted')
                    }
                  >
                    {row.status === 'uploading'
                      ? 'uploading…'
                      : row.status === 'done'
                      ? 'done'
                      : row.status === 'skipped'
                      ? row.message || 'skipped'
                      : row.status === 'error'
                      ? row.message || 'error'
                      : `${Math.round(row.file.size / 1024)} KB`}
                  </span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={handleBulkUpload}
              disabled={bulkRunning || pendingCount === 0}
              className="px-4 py-1.5 rounded-full bg-lc-green text-lc-black font-semibold text-xs hover:brightness-110 transition disabled:opacity-50"
              data-testid="emoji-bulk-submit"
            >
              {bulkRunning ? 'Uploading…' : `Upload ${pendingCount} emoji${pendingCount === 1 ? '' : 's'}`}
            </button>
          </>
        )}
      </div>

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
                  {editingId === e.id ? (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-lc-muted">:</span>
                        <input
                          type="text"
                          value={editingName}
                          autoFocus
                          onChange={(ev) => {
                            const cleaned = ev.target.value
                              .toLowerCase()
                              .replace(/[^a-z0-9_-]/g, '')
                              .slice(0, 32);
                            setEditingName(cleaned);
                          }}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') saveEdit(e.id);
                            if (ev.key === 'Escape') cancelEdit();
                          }}
                          className="px-2 py-0.5 rounded bg-lc-black border border-lc-border text-sm text-lc-white focus:border-lc-green focus:outline-none"
                          data-testid="emoji-edit-input"
                        />
                        <span className="text-sm text-lc-muted">:</span>
                        <button
                          type="button"
                          onClick={() => saveEdit(e.id)}
                          className="px-2 py-0.5 rounded-full bg-lc-green text-lc-black text-[11px] font-semibold"
                          data-testid="emoji-edit-save"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="text-[11px] text-lc-muted hover:text-lc-white"
                        >
                          Cancel
                        </button>
                      </div>
                      {editError && (
                        <p className="text-[11px] text-red-400" data-testid="emoji-edit-error">
                          {editError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-lc-white font-medium">:{e.name}:</p>
                      <p className="text-[11px] text-lc-muted truncate">
                        by {e.createdBy.slice(0, 8)}… · {new Date(e.createdAt).toLocaleDateString()}
                      </p>
                    </>
                  )}
                </div>
                {editingId !== e.id && (
                  <>
                    <button
                      type="button"
                      onClick={() => startEdit(e)}
                      className="px-3 py-1 rounded-full border border-lc-border text-xs text-lc-muted hover:text-lc-white transition"
                      data-testid="emoji-edit"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(e.id)}
                      className="px-3 py-1 rounded-full border border-lc-border text-xs text-lc-muted hover:text-red-400 hover:border-red-400/40 transition"
                      data-testid="emoji-delete"
                    >
                      Delete
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
