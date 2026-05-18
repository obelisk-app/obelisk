'use client';

import { useMemo, useRef, useState } from 'react';
import ModalShell from '@/components/ModalShell';
import {
  publishRelayEmojiSet,
  type RelayEmoji,
  type RelayEmojiSet,
} from '@/lib/relay-emojis';
import {
  isValidCustomEmojiName,
  normalizeCustomEmojiName,
} from '@/lib/custom-emoji-tags';
import { uploadToBlossom } from '@/lib/blossom';

interface DraftEmoji {
  id: string;
  name: string;
  url: string;
}

const inputClasses =
  'w-full rounded border border-lc-border bg-lc-black px-2 py-1.5 text-sm text-lc-white outline-none focus:border-lc-green';
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp)$/i;

function shortHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^wss?:\/\//, '').replace(/\/$/, '');
  }
}

function draftFromSet(set: RelayEmojiSet): DraftEmoji[] {
  return set.emojis.map((emoji) => ({
    id: `${emoji.name}-${emoji.url}`,
    name: emoji.name,
    url: emoji.url,
  }));
}

function emptyDraftEmoji(): DraftEmoji {
  return {
    id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: '',
    url: '',
  };
}

function uniqueEmojiName(rawName: string, used: Set<string>): string {
  const base = normalizeCustomEmojiName(rawName) || 'emoji';
  let name = base;
  let i = 2;
  while (used.has(name)) {
    name = `${base}_${i}`;
    i += 1;
  }
  used.add(name);
  return name;
}

function isEmojiImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT_RE.test(file.name);
}

export default function RelayEmojiAdminModal({
  relayUrl,
  emojiSet,
  configuredRelays,
  onClose,
}: {
  relayUrl: string;
  emojiSet: RelayEmojiSet;
  configuredRelays: ReadonlyArray<string>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(emojiSet.title || 'Obelisk emojis');
  const [rows, setRows] = useState<DraftEmoji[]>(() => draftFromSet(emojiSet));
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [folderUpload, setFolderUpload] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const shareTargets = useMemo(
    () => configuredRelays.filter((r) => r !== relayUrl),
    [configuredRelays, relayUrl],
  );
  const [shareRelay, setShareRelay] = useState('');
  const activeShareRelay = shareRelay && shareTargets.includes(shareRelay)
    ? shareRelay
    : (shareTargets[0] ?? '');

  function updateRow(id: string, patch: Partial<DraftEmoji>) {
    setRows((prev) => prev.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function buildSet(): RelayEmojiSet {
    const seen = new Set<string>();
    const emojis: RelayEmoji[] = [];
    for (const row of rows) {
      const name = normalizeCustomEmojiName(row.name);
      const url = row.url.trim();
      if (!name && !url) continue;
      if (!name || !url) throw new Error('Each emoji needs both a shortcode and an image URL.');
      if (!isValidCustomEmojiName(name)) throw new Error(`Invalid shortcode: ${row.name}`);
      if (seen.has(name)) throw new Error(`Duplicate shortcode: :${name}:`);
      seen.add(name);
      emojis.push({ name, url });
    }
    return {
      title: title.trim() || 'Obelisk emojis',
      emojis: emojis.sort((a, b) => a.name.localeCompare(b.name)),
      updatedAt: Math.floor(Date.now() / 1000),
    };
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      await publishRelayEmojiSet(relayUrl, buildSet());
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function share() {
    if (!activeShareRelay) return;
    setSharing(true);
    setErr(null);
    try {
      await publishRelayEmojiSet(activeShareRelay, buildSet());
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSharing(false);
    }
  }

  async function upload(row: DraftEmoji, file: File | null) {
    if (!file) return;
    setUploadingId(row.id);
    setErr(null);
    try {
      const url = await uploadToBlossom(file);
      updateRow(row.id, {
        url,
        name: row.name || normalizeCustomEmojiName(file.name),
      });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setUploadingId(null);
    }
  }

  async function uploadFolder(files: FileList | null) {
    const imageFiles = Array.from(files ?? []).filter(isEmojiImageFile);
    if (imageFiles.length === 0) {
      setErr('No PNG, JPEG, GIF, or WebP images found in that folder.');
      return;
    }

    setFolderUpload({ done: 0, total: imageFiles.length });
    setErr(null);
    const usedNames = new Set(
      rows.map((row) => normalizeCustomEmojiName(row.name)).filter(Boolean),
    );

    try {
      for (let i = 0; i < imageFiles.length; i += 1) {
        const file = imageFiles[i];
        const name = uniqueEmojiName(file.name, usedNames);
        const url = await uploadToBlossom(file);
        setRows((prev) => [...prev, {
          id: `${name}-${url}`,
          name,
          url,
        }]);
        setFolderUpload({ done: i + 1, total: imageFiles.length });
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setFolderUpload(null);
    }
  }

  return (
    <ModalShell
      onClose={onClose}
      panelClassName="lc-card mx-4 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden bg-lc-dark"
    >
      <header className="flex shrink-0 items-center justify-between border-b border-lc-border px-5 py-3">
        <div>
          <div className="text-base font-bold text-lc-white">Relay emojis</div>
          <div className="text-[11px] text-lc-muted">
            Stored on {shortHost(relayUrl)} as NIP-51 kind 30030 emoji tags.
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-lc-muted hover:bg-lc-card hover:text-lc-white"
          aria-label="Close"
        >
          x
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="mb-4">
          <label className="mb-1.5 block text-xs uppercase tracking-wider text-lc-muted">Set title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Obelisk emojis"
            className={inputClasses}
          />
        </div>

        <div className="overflow-hidden rounded border border-lc-border">
          <table className="w-full text-sm">
            <thead className="bg-lc-black/60 text-left text-[11px] uppercase text-lc-muted">
              <tr>
                <th className="w-16 px-3 py-2">Emoji</th>
                <th className="px-2 py-2">Shortcode</th>
                <th className="px-2 py-2">Image URL</th>
                <th className="w-40 px-2 py-2">Upload</th>
                <th className="w-20 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-lc-muted">
                    No custom emojis on this relay yet.
                  </td>
                </tr>
              ) : rows.map((row) => {
                const normalized = normalizeCustomEmojiName(row.name);
                return (
                  <tr key={row.id} className="border-t border-lc-border/60">
                    <td className="px-3 py-2">
                      {row.url ? (
                        <img
                          src={row.url}
                          alt={normalized ? `:${normalized}:` : ''}
                          className="h-9 w-9 rounded bg-lc-black object-contain"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded bg-lc-black" />
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={row.name}
                        onChange={(e) => updateRow(row.id, { name: e.target.value })}
                        onBlur={() => updateRow(row.id, { name: normalized })}
                        placeholder="party"
                        className={inputClasses}
                      />
                      {normalized && (
                        <div className="mt-1 text-[10px] text-lc-muted">:{normalized}:</div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={row.url}
                        onChange={(e) => updateRow(row.id, { url: e.target.value })}
                        placeholder="https://..."
                        className={inputClasses}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        disabled={uploadingId === row.id}
                        onChange={(e) => {
                          void upload(row, e.currentTarget.files?.[0] ?? null);
                          e.currentTarget.value = '';
                        }}
                        className="block w-full text-xs text-lc-muted file:mr-2 file:rounded file:border-0 file:bg-lc-card file:px-2 file:py-1 file:text-xs file:text-lc-white hover:file:bg-lc-border"
                      />
                      {uploadingId === row.id && (
                        <div className="mt-1 text-[10px] text-lc-green">Uploading...</div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="rounded px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, emptyDraftEmoji()])}
            className="rounded border border-lc-border px-3 py-1.5 text-sm text-lc-white hover:border-lc-green"
          >
            Add emoji
          </button>
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            disabled={!!folderUpload}
            className="rounded border border-lc-border px-3 py-1.5 text-sm text-lc-white hover:border-lc-green disabled:opacity-50"
          >
            Upload folder
          </button>
          <input
            ref={folderInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/gif,image/webp"
            data-testid="relay-emoji-folder-input"
            className="hidden"
            {...({
              webkitdirectory: '',
              directory: '',
            } as React.InputHTMLAttributes<HTMLInputElement> & {
              webkitdirectory: string;
              directory: string;
            })}
            onChange={(e) => {
              void uploadFolder(e.currentTarget.files);
              e.currentTarget.value = '';
            }}
          />
          {folderUpload && (
            <span className="text-xs text-lc-muted">
              Uploading {folderUpload.done}/{folderUpload.total}...
            </span>
          )}
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-2 border-t border-lc-border pt-4">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1.5 block text-xs uppercase tracking-wider text-lc-muted">
              Share this list to another relay
            </label>
            <select
              value={activeShareRelay}
              onChange={(e) => setShareRelay(e.target.value)}
              disabled={shareTargets.length === 0}
              className={inputClasses}
            >
              {shareTargets.length === 0 ? (
                <option value="">No other configured relays</option>
              ) : shareTargets.map((target) => (
                <option key={target} value={target}>{shortHost(target)}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={share}
            disabled={sharing || !!folderUpload || !activeShareRelay}
            className="rounded-lg border border-lc-border px-4 py-1.5 text-sm font-semibold text-lc-white hover:border-lc-green disabled:opacity-50"
          >
            {sharing ? 'Sharing...' : 'Share'}
          </button>
        </div>

        {err && <p className="mt-4 text-xs text-red-400">{err}</p>}
      </div>

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-lc-border px-5 py-3">
        <button onClick={onClose} className="lc-pill lc-pill-secondary text-xs">Cancel</button>
        <button
          onClick={save}
          disabled={saving || !!folderUpload}
          className="rounded-lg bg-lc-green px-4 py-1.5 text-sm font-semibold text-lc-black disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </footer>
    </ModalShell>
  );
}
