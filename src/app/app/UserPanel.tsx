'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { nip19 } from 'nostr-tools';
import { nostrActions, useUserMetadata } from '@/lib/nostr-bridge';

interface UserPanelProps {
  pubkey: string;
  isMe: boolean;
  onClose: () => void;
  onLogout?: () => void;
  /** Anchor (the trigger element) — panel is positioned relative to it. */
  anchor?: { x: number; y: number; placement?: 'top' | 'bottom' };
  /** Open directly into the fullscreen edit modal. */
  initialEditing?: boolean;
}

export default function UserPanel({ pubkey, isMe, onClose, onLogout, anchor, initialEditing = false }: UserPanelProps) {
  const meta = useUserMetadata(pubkey);
  const [editing, setEditing] = useState(initialEditing);

  useEffect(() => {
    nostrActions.ensureUserMetadata(pubkey).catch(() => {});
  }, [pubkey]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setEditing(false); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [editing]);

  const npub = (() => {
    try { return nip19.npubEncode(pubkey); } catch { return null; }
  })();
  const displayName = meta?.displayName || meta?.name || pubkey.slice(0, 10);

  if (typeof document === 'undefined') return null;

  // Position: by default fixed bottom-left of viewport (Discord-style). If
  // an anchor is provided, place above/below it.
  const style: React.CSSProperties = anchor
    ? {
        position: 'fixed',
        left: Math.max(8, Math.min(window.innerWidth - 348, anchor.x)),
        ...(anchor.placement === 'top'
          ? { bottom: window.innerHeight - anchor.y + 8 }
          : { top: anchor.y + 8 }),
      }
    : { position: 'fixed', left: 8, bottom: 72 };

  if (editing && isMe) {
    return createPortal(
      <div
        className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm p-10 md:p-24 flex items-stretch justify-stretch"
        data-testid="user-edit-modal"
      >
        <div className="relative flex w-full rounded-2xl overflow-hidden border border-lc-border shadow-2xl bg-lc-black">
          <button
            onClick={() => { setEditing(false); onClose(); }}
            className="absolute top-5 right-5 z-10 w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30 flex items-center justify-center transition-colors ring-2 ring-red-500/30 hover:ring-red-500/60"
            aria-label="Close"
            title="Close (Esc)"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <aside className="w-64 shrink-0 bg-lc-dark border-r border-lc-border flex flex-col">
            <div className="px-5 py-5 border-b border-lc-border">
              <div className="text-[10px] uppercase tracking-wider text-lc-muted font-semibold mb-2">User settings</div>
              <div className="flex items-center gap-2 min-w-0">
                {meta?.picture ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={meta.picture} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-sm font-semibold shrink-0">
                    {displayName[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-sm text-lc-white truncate">{displayName}</div>
                  {meta?.nip05 && <div className="text-[10px] text-lc-green truncate">{meta.nip05}</div>}
                </div>
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto p-2">
              <div className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm bg-lc-green/15 text-lc-green">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                <span>Profile</span>
              </div>
            </nav>
          </aside>
          <main className="flex-1 min-w-0 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-10 py-10">
              <div className="mb-6">
                <div className="text-xs uppercase tracking-wider text-lc-muted font-semibold">Profile</div>
                <h2 className="text-lc-white text-xl font-semibold mt-2">Edit profile</h2>
              </div>
              <EditProfileForm
                initial={meta}
                onCancel={() => { setEditing(false); onClose(); }}
                onSaved={() => { setEditing(false); onClose(); }}
              />
            </div>
          </main>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[65]" onClick={onClose} />
      <div
        style={style}
        className="z-[70] w-[340px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl border border-lc-border bg-lc-dark shadow-2xl"
      >
        {/* Banner */}
        {meta?.banner ? (
          <div className="h-28 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={meta.banner} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="h-20 bg-gradient-to-r from-lc-olive/30 to-lc-dark" />
        )}

        {/* Avatar + name */}
        <div className="relative -mt-10 px-5">
          {meta?.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={meta.picture}
              alt={displayName}
              className="h-20 w-20 rounded-full object-cover ring-4 ring-lc-dark"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-lc-olive text-2xl font-semibold text-lc-green ring-4 ring-lc-dark">
              {displayName[0]?.toUpperCase()}
            </div>
          )}
          <div className="mt-3">
            <div className="text-lg font-semibold text-lc-white">{displayName}</div>
            {meta?.nip05 && <div className="truncate text-xs text-lc-green">{meta.nip05}</div>}
            {npub && (
              <div className="mt-0.5 truncate font-mono text-[10px] text-lc-muted">
                {npub.slice(0, 24)}…
              </div>
            )}
          </div>
        </div>

        {/* About */}
        {meta?.about && (
          <div className="mt-2 px-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-lc-muted">
              About
            </div>
            <div className="mt-0.5 line-clamp-3 text-xs text-lc-muted">{meta.about}</div>
          </div>
        )}

        <div className="mt-3 border-t border-lc-border" />

        {(
          <>
            {npub && (
              <button
                onClick={() => navigator.clipboard?.writeText(npub).catch(() => {})}
                className="flex w-full items-center gap-2 p-3 text-left text-sm text-lc-white transition hover:bg-lc-border/50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                Copy npub
              </button>
            )}
            <button
              onClick={() => navigator.clipboard?.writeText(pubkey).catch(() => {})}
              className="flex w-full items-center gap-2 p-3 text-left text-sm text-lc-white transition hover:bg-lc-border/50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              Copy pubkey (hex)
            </button>
            {npub && (
              <a
                href={`https://njump.me/${npub}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center gap-2 p-3 text-left text-sm text-lc-white transition hover:bg-lc-border/50"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                Open in another Nostr client
              </a>
            )}

            {isMe && (
              <>
                <div className="border-t border-lc-border" />
                <button
                  onClick={() => setEditing(true)}
                  className="flex w-full items-center gap-2 p-3 text-left text-sm text-lc-white transition hover:bg-lc-border/50"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Edit profile
                </button>
                <div className="border-t border-lc-border" />
                <button
                  onClick={onLogout}
                  className="flex w-full items-center gap-2 p-3 text-left text-xs text-red-400 transition hover:bg-lc-border/50"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Log out
                </button>
              </>
            )}
          </>
        )}
      </div>
    </>,
    document.body,
  );
}

function EditProfileForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: { displayName: string | null; name: string | null; about: string | null; picture: string | null; banner: string | null; nip05: string | null; website: string | null } | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.displayName || initial?.name || '');
  const [about, setAbout] = useState(initial?.about || '');
  const [picture, setPicture] = useState(initial?.picture || '');
  const [banner, setBanner] = useState(initial?.banner || '');
  const [nip05, setNip05] = useState(initial?.nip05 || '');
  const [website, setWebsite] = useState(initial?.website || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => { firstField.current?.focus(); }, []);

  const save = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      await nostrActions.editUserMetadata({
        name: name.trim(),
        displayName: name.trim(),
        about: about.trim(),
        picture: picture.trim(),
        banner: banner.trim(),
        nip05: nip05.trim(),
        website: website.trim(),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to publish');
    } finally {
      setSaving(false);
    }
  };

  const fieldCls = 'w-full rounded-md border border-lc-border bg-lc-black px-3 py-2 text-sm text-lc-white placeholder:text-lc-muted focus:border-lc-green focus:outline-none';

  return (
    <div className="space-y-3 p-4">
      <Field label="Name">
        <input ref={firstField} value={name} onChange={(e) => setName(e.target.value)} className={fieldCls} />
      </Field>
      <Field label="About">
        <textarea value={about} onChange={(e) => setAbout(e.target.value)} rows={2} className={fieldCls} />
      </Field>
      <Field label="Picture URL">
        <input value={picture} onChange={(e) => setPicture(e.target.value)} placeholder="https://…" className={fieldCls} />
      </Field>
      <Field label="Banner URL">
        <input value={banner} onChange={(e) => setBanner(e.target.value)} placeholder="https://…" className={fieldCls} />
      </Field>
      <Field label="NIP-05">
        <input value={nip05} onChange={(e) => setNip05(e.target.value)} placeholder="you@example.com" className={fieldCls} />
      </Field>
      <Field label="Website">
        <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://…" className={fieldCls} />
      </Field>
      {error && <div className="text-xs text-red-400">{error}</div>}
      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-lc-green px-3 py-1.5 text-sm font-semibold text-lc-black hover:bg-lc-green/90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="rounded-md border border-lc-border px-3 py-1.5 text-sm text-lc-white hover:bg-lc-border/40"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-lc-muted">{label}</span>
      {children}
    </label>
  );
}
