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
const secondaryButtonClasses =
  'rounded border border-lc-border px-3 py-1.5 text-sm text-lc-white hover:border-lc-green disabled:opacity-50';

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

function draftEmojiIssue(row: DraftEmoji, nameCounts: ReadonlyMap<string, number>): string | null {
  const name = normalizeCustomEmojiName(row.name);
  const url = row.url.trim();
  if (!name && !url) return null;
  if (!name) return "Shortcode needed";
  if (!url) return "Image URL needed";
  if (!isValidCustomEmojiName(name)) return "Invalid shortcode";
  if ((nameCounts.get(name) ?? 0) > 1) return "Duplicate shortcode";
  return null;
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

  const [query, setQuery] = useState("");
  const shareTargets = useMemo(
    () => configuredRelays.filter((r) => r !== relayUrl),
    [configuredRelays, relayUrl],
  );
  const [selectedShareRelays, setSelectedShareRelays] = useState<Set<string>>(
    () => new Set(shareTargets[0] ? [shareTargets[0]] : []),
  );
  const [shareProgress, setShareProgress] = useState<{ done: number; total: number } | null>(null);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);

  const selectedShareTargets = useMemo(
    () => shareTargets.filter((target) => selectedShareRelays.has(target)),
    [selectedShareRelays, shareTargets],
  );
  const shareTargetCount = selectedShareTargets.length;

  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      const name = normalizeCustomEmojiName(row.name);
      if (!name) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  const rowIssues = useMemo(() => {
    const issues = new Map<string, string>();
    for (const row of rows) {
      const issue = draftEmojiIssue(row, nameCounts);
      if (issue) issues.set(row.id, issue);
    }
    return issues;
  }, [nameCounts, rows]);
  const hasRowIssues = rowIssues.size > 0;

  const filteredRows = useMemo(() => {
    const raw = query.trim().toLowerCase();
    const normalized = normalizeCustomEmojiName(query);
    if (!raw && !normalized) return rows;
    return rows.filter((row) => {
      const name = normalizeCustomEmojiName(row.name);
      return name.includes(normalized) || row.url.toLowerCase().includes(raw);
    });
  }, [query, rows]);
  const hiddenRowCount = rows.length - filteredRows.length;

  function updateRow(id: string, patch: Partial<DraftEmoji>) {
    setShareSuccess(null);
    setRows((prev) => prev.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function removeRow(id: string) {
    setShareSuccess(null);
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  function toggleShareRelay(target: string) {
    setShareSuccess(null);
    setSelectedShareRelays((prev) => {
      const next = new Set(prev);
      if (next.has(target)) next.delete(target);
      else next.add(target);
      return next;
    });
  }

  function selectAllShareTargets() {
    setShareSuccess(null);
    setSelectedShareRelays(new Set(shareTargets));
  }

  function clearShareTargets() {
    setShareSuccess(null);
    setSelectedShareRelays(new Set());
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
    setShareSuccess(null);
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
    if (shareTargetCount === 0 || hasRowIssues) return;
    setSharing(true);
    setErr(null);
    setShareSuccess(null);
    setShareProgress({ done: 0, total: shareTargetCount });
    try {
      const set = buildSet();
      for (let i = 0; i < selectedShareTargets.length; i += 1) {
        await publishRelayEmojiSet(selectedShareTargets[i], set);
        setShareProgress({ done: i + 1, total: selectedShareTargets.length });
      }
      setShareSuccess(`Shared to ${selectedShareTargets.length} relay${selectedShareTargets.length === 1 ? "" : "s"}.`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSharing(false);
      setShareProgress(null);
    }
  }

  async function upload(row: DraftEmoji, file: File | null) {
    if (!file) return;
    setUploadingId(row.id);
    setErr(null);
    setShareSuccess(null);
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
    setShareSuccess(null);
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
      panelClassName="lc-card mx-3 flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden bg-lc-dark"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-lc-border px-5 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-base font-bold text-lc-white">Relay emojis</div>
            <span className="rounded-full border border-lc-border px-2 py-0.5 text-[11px] text-lc-muted">
              {rows.length} item{rows.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="truncate text-[11px] text-lc-muted">{shortHost(relayUrl)}</div>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-lc-muted hover:bg-lc-card hover:text-lc-white"
          aria-label="Close"
          title="Close"
        >
          x
        </button>
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="flex min-h-0 flex-col">
          <div className="grid shrink-0 gap-3 border-b border-lc-border p-4 md:grid-cols-[minmax(0,1fr)_minmax(14rem,18rem)]">
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-lc-muted">Set title</span>
              <input
                value={title}
                onChange={(e) => {
                  setShareSuccess(null);
                  setTitle(e.target.value);
                }}
                placeholder="Obelisk emojis"
                className={inputClasses}
              />
            </label>
            <label className="block min-w-0">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-lc-muted">Search</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="party, wave, .gif"
                className={inputClasses}
              />
            </label>
            <div className="flex flex-wrap items-center gap-2 md:col-span-2">
              <button
                type="button"
                onClick={() => setRows((prev) => [...prev, emptyDraftEmoji()])}
                className={secondaryButtonClasses}
              >
                Add emoji
              </button>
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                disabled={!!folderUpload}
                className={secondaryButtonClasses}
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
                  webkitdirectory: "",
                  directory: "",
                } as React.InputHTMLAttributes<HTMLInputElement> & {
                  webkitdirectory: string;
                  directory: string;
                })}
                onChange={(e) => {
                  void uploadFolder(e.currentTarget.files);
                  e.currentTarget.value = "";
                }}
              />
              {folderUpload && (
                <span className="text-xs text-lc-muted">
                  Uploading {folderUpload.done}/{folderUpload.total}...
                </span>
              )}
              {hiddenRowCount > 0 && (
                <span className="text-xs text-lc-muted">{hiddenRowCount} hidden by search</span>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {rows.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-lc-muted">
                No custom emojis on this relay yet.
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-lc-muted">
                No emojis match this search.
              </div>
            ) : filteredRows.map((row) => {
              const normalized = normalizeCustomEmojiName(row.name);
              const issue = rowIssues.get(row.id);
              return (
                <div key={row.id} className="grid gap-3 border-b border-lc-border/60 px-4 py-3 md:grid-cols-[3rem_minmax(0,1fr)_auto]">
                  <div className="flex md:block">
                    {row.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.url}
                        alt={normalized ? ":" + normalized + ":" : ""}
                        className="h-12 w-12 rounded bg-lc-black object-contain"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded bg-lc-black" />
                    )}
                  </div>
                  <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(9rem,14rem)_minmax(0,1fr)]">
                    <label className="min-w-0">
                      <span className="mb-1 block text-[10px] uppercase tracking-wider text-lc-muted">Shortcode</span>
                      <input
                        value={row.name}
                        onChange={(e) => updateRow(row.id, { name: e.target.value })}
                        onBlur={() => updateRow(row.id, { name: normalized })}
                        placeholder="party"
                        className={inputClasses}
                        aria-invalid={!!issue}
                      />
                      <div className="mt-1 min-h-4 text-[10px]">
                        {issue ? (
                          <span className="text-red-300">{issue}</span>
                        ) : normalized ? (
                          <span className="text-lc-muted">:{normalized}:</span>
                        ) : null}
                      </div>
                    </label>
                    <label className="min-w-0">
                      <span className="mb-1 block text-[10px] uppercase tracking-wider text-lc-muted">Image URL</span>
                      <input
                        value={row.url}
                        onChange={(e) => updateRow(row.id, { url: e.target.value })}
                        placeholder="https://..."
                        className={inputClasses}
                      />
                    </label>
                  </div>
                  <div className="flex items-end gap-2 md:flex-col md:items-stretch md:justify-end">
                    <label className={secondaryButtonClasses + " cursor-pointer text-center"}>
                      <span>{uploadingId === row.id ? "Uploading..." : "Upload"}</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp"
                        disabled={uploadingId === row.id}
                        onChange={(e) => {
                          void upload(row, e.currentTarget.files?.[0] ?? null);
                          e.currentTarget.value = "";
                        }}
                        className="hidden"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="rounded border border-transparent px-3 py-1.5 text-sm text-red-300 hover:border-red-500/40 hover:bg-red-500/10"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border-t border-lc-border bg-lc-black/30 md:border-l md:border-t-0">
          <div className="border-b border-lc-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-lc-white">Share to relays</div>
                <div className="text-[11px] text-lc-muted">
                  {shareTargets.length === 0 ? "No targets" : shareTargetCount + "/" + shareTargets.length + " selected"}
                </div>
              </div>
              {shareTargets.length > 1 && (
                <div className="flex gap-2 text-[11px]">
                  <button type="button" onClick={selectAllShareTargets} className="text-lc-green hover:underline">
                    All
                  </button>
                  <button type="button" onClick={clearShareTargets} className="text-lc-muted hover:text-lc-white">
                    None
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {shareTargets.length === 0 ? (
              <div className="rounded border border-lc-border px-3 py-4 text-center text-xs text-lc-muted">
                No other configured relays.
              </div>
            ) : (
              <div className="space-y-2">
                {shareTargets.map((target) => {
                  const checked = selectedShareRelays.has(target);
                  return (
                    <label
                      key={target}
                      className={
                        "flex cursor-pointer items-center gap-3 rounded border px-3 py-2 text-sm transition " +
                        (checked
                          ? "border-lc-green/70 bg-lc-green/10 text-lc-white"
                          : "border-lc-border text-lc-muted hover:border-lc-green/50 hover:text-lc-white")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleShareRelay(target)}
                        className="h-4 w-4 accent-lc-green"
                      />
                      <span className="min-w-0 flex-1 truncate">{shortHost(target)}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-lc-border p-4">
            <button
              type="button"
              onClick={share}
              disabled={sharing || !!folderUpload || hasRowIssues || shareTargetCount === 0}
              className="w-full rounded-lg border border-lc-border px-4 py-2 text-sm font-semibold text-lc-white hover:border-lc-green disabled:opacity-50"
            >
              {sharing && shareProgress
                ? "Sharing " + shareProgress.done + "/" + shareProgress.total + "..."
                : "Share to " + shareTargetCount + " relay" + (shareTargetCount === 1 ? "" : "s")}
            </button>
            {shareSuccess && <div className="mt-2 text-xs text-lc-green">{shareSuccess}</div>}
          </div>
        </aside>
      </div>

      {err && <p className="shrink-0 border-t border-lc-border px-5 py-2 text-xs text-red-400">{err}</p>}

      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-lc-border px-5 py-3">
        <button onClick={onClose} className="lc-pill lc-pill-secondary text-xs">Cancel</button>
        <button
          onClick={save}
          disabled={saving || !!folderUpload || hasRowIssues}
          className="rounded-lg bg-lc-green px-4 py-1.5 text-sm font-semibold text-lc-black disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </footer>
    </ModalShell>
  );
}
