'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { emojiForOptionText } from '@/components/chat/ChannelEmoji';
import EmojiPicker from '@/components/chat/EmojiPicker';
import MessageContent from '@/components/chat/MessageContent';

/**
 * Admin UI for "post as the server" content — welcome messages at the top
 * of text channels (optionally pinned) and forum posts in forum channels.
 * Everything created here is authored by `SYSTEM_PUBKEY`; the chat client
 * renders it wearing the server's own name + icon via `getAuthorProfile`,
 * so admins never leak their personal npub onto the welcome banner.
 *
 * The component talks to:
 *   - `GET  /api/channels?serverId=…`                          channel tree + forum tags
 *   - `GET  /api/admin/channels/:id/system-messages`          existing system content
 *   - `POST /api/admin/channels/:id/system-messages`          create
 *   - `PATCH  /api/admin/messages/:id`                        edit
 *   - `DELETE /api/admin/messages/:id`                        soft delete
 */

interface ForumTag {
  id: string;
  name: string;
  color: string;
  position?: number;
}

interface ChannelRow {
  id: string;
  name: string;
  emoji: string | null;
  type: string;
  forumTags?: ForumTag[];
}

interface SystemMessage {
  id: string;
  channelId: string;
  authorPubkey: string;
  title: string | null;
  content: string;
  createdAt: string;
  editedAt: string | null;
  pinnedAt: string | null;
  pinnedByPubkey: string | null;
  tags: { id: string; name: string; color: string }[];
}

interface AuthorProfile {
  pubkey: string;
  displayName: string | null;
  picture: string | null;
}

interface SystemContentManagerProps {
  serverId: string;
}

interface DraftState {
  content: string;
  title: string;
  tagIds: string[];
  pin: boolean;
}

const EMPTY_DRAFT: DraftState = { content: '', title: '', tagIds: [], pin: false };

export default function SystemContentManager({ serverId }: SystemContentManagerProps) {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [channelsLoading, setChannelsLoading] = useState(true);

  const [author, setAuthor] = useState<AuthorProfile | null>(null);
  const [messages, setMessages] = useState<SystemMessage[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SystemMessage | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [serverEmojis, setServerEmojis] = useState<Record<string, string>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch custom server emojis once so the picker can offer them.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/emojis?serverId=${encodeURIComponent(serverId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const map: Record<string, string> = {};
        for (const e of (data.emojis || []) as { name: string; url: string }[]) {
          map[e.name] = e.url;
        }
        setServerEmojis(map);
      })
      .catch(() => {
        /* emoji list is optional — picker still works with unicode */
      });
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  const insertAtCursor = useCallback((text: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setDraft((prev) => ({ ...prev, content: prev.content + text }));
      return;
    }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const next = before + text + after;
    setDraft((prev) => ({ ...prev, content: next }));
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      textareaRef.current.focus();
      const pos = start + text.length;
      textareaRef.current.setSelectionRange(pos, pos);
    });
  }, []);

  const selectedChannel = useMemo(
    () => channels.find((c) => c.id === selectedChannelId) || null,
    [channels, selectedChannelId],
  );
  const isForum = selectedChannel?.type === 'forum';

  // 1) Load the channel tree once (same endpoint the chat sidebar uses —
  //    it already returns forumTags per channel, so we don't need a
  //    separate tag endpoint).
  useEffect(() => {
    let cancelled = false;
    setChannelsLoading(true);
    fetch(`/api/channels?serverId=${encodeURIComponent(serverId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const flat: ChannelRow[] = [];
        for (const ch of (data.pinnedChannels || []) as ChannelRow[]) {
          if (ch.type === 'text' || ch.type === 'forum') flat.push(ch);
        }
        for (const cat of (data.categories || []) as { channels: ChannelRow[] }[]) {
          for (const ch of cat.channels || []) {
            if (ch.type === 'text' || ch.type === 'forum') flat.push(ch);
          }
        }
        setChannels(flat);
        if (flat.length > 0 && !selectedChannelId) {
          setSelectedChannelId(flat[0].id);
        }
      })
      .finally(() => {
        if (!cancelled) setChannelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // We only want this to run on serverId changes. selectedChannelId is
    // intentionally excluded so re-selecting doesn't re-fetch the tree.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  // 2) Load existing system content for the selected channel.
  const fetchList = useCallback(async () => {
    if (!selectedChannelId) return;
    setListLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/channels/${encodeURIComponent(selectedChannelId)}/system-messages`,
      );
      if (!res.ok) {
        setMessages([]);
        setAuthor(null);
        return;
      }
      const data = await res.json();
      setMessages(data.messages || []);
      setAuthor(data.author || null);
    } finally {
      setListLoading(false);
    }
  }, [selectedChannelId]);

  useEffect(() => {
    fetchList();
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  }, [fetchList]);

  // Build a safe payload matching the server-side validation rules.
  function buildPayload(d: DraftState) {
    if (isForum) {
      return {
        title: d.title.trim(),
        content: d.content.trim(),
        tagIds: d.tagIds,
      };
    }
    return {
      content: d.content.trim(),
      pin: d.pin,
    };
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChannelId) return;
    setError(null);

    // Basic client-side checks that match the server's rules. Full
    // validation still happens server-side.
    if (!draft.content.trim()) {
      setError('Content is required');
      return;
    }
    if (isForum && !draft.title.trim()) {
      setError('Title is required for forum posts');
      return;
    }

    setSaving(true);
    try {
      const url = editingId
        ? `/api/admin/messages/${encodeURIComponent(editingId)}`
        : `/api/admin/channels/${encodeURIComponent(selectedChannelId)}/system-messages`;
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(draft)),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || `Request failed (${res.status})`);
        return;
      }
      setDraft(EMPTY_DRAFT);
      setEditingId(null);
      await fetchList();
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (m: SystemMessage) => {
    setEditingId(m.id);
    setDraft({
      content: m.content,
      title: m.title || '',
      tagIds: m.tags.map((t) => t.id),
      pin: m.pinnedAt !== null,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/messages/${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || `Delete failed (${res.status})`);
        return;
      }
      setDeleteTarget(null);
      await fetchList();
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePin = async (m: SystemMessage) => {
    // Text channels only. Reuses the existing pin-toggle endpoint so any
    // pinned-panel subscribers receive the same `message-pinned` event they
    // already handle.
    setError(null);
    try {
      const res = await fetch(
        `/api/channels/${encodeURIComponent(m.channelId)}/messages/${encodeURIComponent(m.id)}/pin`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || `Pin toggle failed (${res.status})`);
        return;
      }
      await fetchList();
    } catch {
      setError('Pin toggle failed');
    }
  };

  const toggleTag = (tagId: string) => {
    setDraft((prev) => ({
      ...prev,
      tagIds: prev.tagIds.includes(tagId)
        ? prev.tagIds.filter((t) => t !== tagId)
        : [...prev.tagIds, tagId],
    }));
  };

  if (channelsLoading) {
    return (
      <div className="space-y-3" data-testid="system-content-loading">
        <div className="lc-skeleton h-10 rounded-lg" />
        <div className="lc-skeleton h-40 rounded-xl" />
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <p className="text-sm text-lc-muted py-12 text-center">
        No text or forum channels in this server yet.
      </p>
    );
  }

  const identityLabel =
    author?.displayName || 'Server';
  const identityPicture = author?.picture || null;

  return (
    <div className="space-y-6" data-testid="system-content-manager">
      {/* Channel picker */}
      <div>
        <label className="block text-xs text-lc-muted mb-1.5 uppercase tracking-wider">
          Channel
        </label>
        <select
          value={selectedChannelId}
          onChange={(e) => setSelectedChannelId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none transition-colors"
          data-testid="system-channel-picker"
        >
          {channels.map((ch) => (
            <option key={ch.id} value={ch.id}>
              {emojiForOptionText(ch.emoji) ? `${emojiForOptionText(ch.emoji)} ` : ''}
              {ch.name}
              {ch.type === 'forum' ? ' (forum)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Create / edit form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-lc-border bg-lc-dark/40 p-6 space-y-4"
        data-testid="system-content-form"
      >
        <div className="flex items-center gap-3">
          {identityPicture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={identityPicture}
              alt={identityLabel}
              className="w-10 h-10 rounded-full object-cover border border-lc-border"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-lc-green/10 border border-lc-border flex items-center justify-center text-lc-green text-sm font-bold">
              {identityLabel.slice(0, 1)}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-lc-white">
              Posting as <span className="text-lc-green">{identityLabel}</span>
            </p>
            <p className="text-xs text-lc-muted">
              Readers see the server&rsquo;s own name and icon, not your personal account.
            </p>
          </div>
        </div>

        {isForum && (
          <div>
            <label className="block text-xs text-lc-muted mb-1.5 uppercase tracking-wider">
              Title
            </label>
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none transition-colors"
              data-testid="system-content-title"
              maxLength={200}
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs text-lc-muted uppercase tracking-wider">
              Content
            </label>
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              className="text-xs text-lc-muted hover:text-lc-green transition-colors"
              data-testid="system-content-preview-toggle"
            >
              {showPreview ? 'Edit' : 'Preview'}
            </button>
          </div>
          {showPreview ? (
            <div
              className="w-full min-h-[10rem] px-3 py-2 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm"
              data-testid="system-content-preview"
            >
              {draft.content.trim() ? (
                <MessageContent content={draft.content} />
              ) : (
                <span className="text-lc-muted italic">Nothing to preview yet.</span>
              )}
            </div>
          ) : (
            <div className="relative">
              <textarea
                ref={textareaRef}
                value={draft.content}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                rows={isForum ? 6 : 10}
                className="w-full px-3 py-2 pr-10 rounded-lg bg-lc-black border border-lc-border text-lc-white text-sm focus:border-lc-green focus:outline-none transition-colors font-mono"
                data-testid="system-content-body"
                maxLength={4000}
                placeholder={
                  isForum
                    ? 'Forum post body. Markdown supported.'
                    : 'Message body. Markdown supported: **bold**, # heading, lists, links.'
                }
              />
              <div className="absolute bottom-2 right-2">
                <button
                  type="button"
                  aria-label="Emoji"
                  onClick={() => setEmojiOpen((o) => !o)}
                  className="p-1.5 rounded-lg text-lc-muted hover:text-lc-green transition-colors"
                  data-testid="system-content-emoji-button"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                    <line x1="9" y1="9" x2="9.01" y2="9" />
                    <line x1="15" y1="9" x2="15.01" y2="9" />
                  </svg>
                </button>
                {emojiOpen && (
                  <EmojiPicker
                    onSelect={(emoji) => {
                      insertAtCursor(emoji);
                      setEmojiOpen(false);
                    }}
                    onClose={() => setEmojiOpen(false)}
                    serverEmojis={serverEmojis}
                  />
                )}
              </div>
            </div>
          )}
          <p className="text-xs text-lc-muted mt-1">
            Supports Markdown: <code>**bold**</code>, <code># heading</code>, lists, links.
          </p>
        </div>

        {isForum && selectedChannel?.forumTags && selectedChannel.forumTags.length > 0 && (
          <div>
            <label className="block text-xs text-lc-muted mb-1.5 uppercase tracking-wider">
              Tags
            </label>
            <div className="flex flex-wrap gap-2" data-testid="system-content-tags">
              {selectedChannel.forumTags.map((tag) => {
                const active = draft.tagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      active
                        ? 'text-lc-black'
                        : 'text-lc-muted border-lc-border hover:text-lc-white'
                    }`}
                    style={active ? { backgroundColor: tag.color, borderColor: tag.color } : {}}
                    data-testid={`system-tag-${tag.id}`}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!isForum && (
          <label className="inline-flex items-center gap-2 text-sm text-lc-white">
            <input
              type="checkbox"
              checked={draft.pin}
              onChange={(e) => setDraft({ ...draft, pin: e.target.checked })}
              data-testid="system-content-pin"
              disabled={editingId !== null}
            />
            Pin this message to the top of the channel
            {editingId !== null && (
              <span className="text-xs text-lc-muted">(use Pin/Unpin on the card to toggle)</span>
            )}
          </label>
        )}

        {error && (
          <p className="text-xs text-red-400" data-testid="system-content-error">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="lc-pill-primary px-5 py-2 text-xs font-semibold disabled:opacity-50"
            data-testid="system-content-submit"
          >
            {saving
              ? editingId
                ? 'Saving…'
                : 'Posting…'
              : editingId
                ? 'Save changes'
                : isForum
                  ? `Create post as ${identityLabel}`
                  : `Post as ${identityLabel}`}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="lc-pill-secondary px-5 py-2 text-xs font-semibold"
              data-testid="system-content-cancel"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Existing content list */}
      <div>
        <h3 className="text-sm font-semibold text-lc-white mb-3">
          Existing server-authored content
        </h3>
        {listLoading ? (
          <div className="space-y-2">
            <div className="lc-skeleton h-20 rounded-xl" />
            <div className="lc-skeleton h-20 rounded-xl" />
          </div>
        ) : messages.length === 0 ? (
          <div className="rounded-xl border border-lc-border bg-lc-dark/40 py-10">
            <p className="text-sm text-lc-muted text-center">
              Nothing posted yet. Use the form above to create the first one.
            </p>
          </div>
        ) : (
          <div className="space-y-2" data-testid="system-content-list">
            {messages.map((m) => (
              <div
                key={m.id}
                className="rounded-xl border border-lc-border bg-lc-dark/40 p-4"
                data-testid={`system-content-row-${m.id}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {m.title && (
                      <p className="text-sm font-semibold text-lc-white truncate">{m.title}</p>
                    )}
                    <div className="text-xs text-lc-muted break-words">
                      <MessageContent content={m.content} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {m.pinnedAt && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-lc-green/15 text-lc-green border border-lc-green/30">
                          Pinned
                        </span>
                      )}
                      {m.tags.map((t) => (
                        <span
                          key={t.id}
                          className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-lc-black"
                          style={{ backgroundColor: t.color }}
                        >
                          {t.name}
                        </span>
                      ))}
                      {m.editedAt && (
                        <span className="text-[10px] text-lc-muted italic">edited</span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => handleEdit(m)}
                      className="text-xs text-lc-muted hover:text-lc-white"
                      data-testid={`system-content-edit-${m.id}`}
                    >
                      Edit
                    </button>
                    {!isForum && (
                      <button
                        type="button"
                        onClick={() => handleTogglePin(m)}
                        className="text-xs text-lc-muted hover:text-lc-white"
                        data-testid={`system-content-pin-${m.id}`}
                      >
                        {m.pinnedAt ? 'Unpin' : 'Pin'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(m)}
                      className="text-xs text-red-400 hover:text-red-300"
                      data-testid={`system-content-delete-${m.id}`}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Delete system content"
          message={`This will permanently remove "${deleteTarget.title || deleteTarget.content.slice(0, 40)}". This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
