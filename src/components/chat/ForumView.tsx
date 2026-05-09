'use client';

/**
 * Forum-channel view: a list of child threads. Each thread is itself a
 * regular NIP-29 text channel — pinned to its forum container by the
 * `["parent", forumGroupId]` tag on its kind 9002 metadata. Clicking a
 * thread navigates the app to that child group, where the existing chat
 * panel takes over (no special "post" / "reply" event kinds — every
 * message in a thread is a normal kind 9).
 *
 * Threads are surfaced from `useChildrenByParent()[forumGroupId]`. Per the
 * UX requirement, only threads that have at least one chat message are
 * shown; empty / aborted threads stay hidden until someone speaks.
 */
import { useMemo, useState } from 'react';
import {
  useChildrenByParent,
  useGroups,
  useSignerReady,
  useMessages,
  nostrActions,
} from '@/lib/nostr-bridge';
import { useProfile, usePubkey } from '@nostr-wot/data/react';
const useUserMetadata = useProfile;
const useMyPubkey = usePubkey;
import type { JsGroup } from '@/lib/nostr-bridge';

interface Props {
  groupId: string;
  channelName?: string;
  /** Open a thread (child group) as the active view in the host shell. */
  onSelectThread: (childGroupId: string) => void;
}

export default function ForumView({ groupId, channelName, onSelectThread }: Props) {
  const childrenByParent = useChildrenByParent();
  const groups = useGroups();
  const childIds = childrenByParent[groupId] ?? [];
  const childGroups = useMemo<JsGroup[]>(() => {
    const byId = new Map(groups.map((g) => [g.id, g] as const));
    return childIds.map((id) => byId.get(id)).filter(Boolean) as JsGroup[];
  }, [childIds, groups]);
  const [showNewThread, setShowNewThread] = useState(false);

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      <div className="h-12 px-4 border-b border-lc-border flex items-center justify-between shrink-0">
        <div className="text-sm font-semibold text-lc-white truncate">
          {channelName ? `# ${channelName}` : 'Forum'}
        </div>
        <NewThreadButton onClick={() => setShowNewThread(true)} />
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {childGroups.length === 0 ? (
          <EmptyForum onNewThread={() => setShowNewThread(true)} />
        ) : (
          childGroups.map((g) => (
            <ThreadCard key={g.id} thread={g} onOpen={() => onSelectThread(g.id)} />
          ))
        )}
      </div>
      {showNewThread && (
        <NewThreadModal
          forumGroupId={groupId}
          isPublic={groups.find((g) => g.id === groupId)?.isPublic ?? true}
          isOpen={groups.find((g) => g.id === groupId)?.isOpen ?? true}
          onClose={() => setShowNewThread(false)}
          onCreated={(childId) => {
            setShowNewThread(false);
            onSelectThread(childId);
          }}
        />
      )}
    </div>
  );
}

function NewThreadButton({ onClick }: { onClick: () => void }) {
  const ready = useSignerReady();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!ready}
      className="lc-pill-primary text-xs px-3 py-1 disabled:opacity-40"
    >
      New thread
    </button>
  );
}

function EmptyForum({ onNewThread }: { onNewThread: () => void }) {
  const ready = useSignerReady();
  return (
    <div className="flex flex-col items-center justify-center h-full text-center text-lc-muted py-12">
      <div className="text-sm">No threads yet.</div>
      {ready && (
        <button
          type="button"
          onClick={onNewThread}
          className="mt-3 text-lc-green hover:text-lc-green/80 text-sm font-medium"
        >
          Start the first thread →
        </button>
      )}
    </div>
  );
}

/**
 * A thread card. Renders only when the thread (child group) has at least
 * one chat message — empty threads stay hidden, per the forum UX rule.
 * The first message acts as the OP body; subsequent messages are the
 * conversation.
 */
function ThreadCard({ thread, onOpen }: { thread: JsGroup; onOpen: () => void }) {
  const messages = useMessages(thread.id);
  const op = messages[0] ?? null;
  const lastMsg = messages[messages.length - 1] ?? null;
  // Hooks must run unconditionally — pass `null` while there's nothing to
  // resolve so the user-metadata subscription stays inert until the first
  // message lands.
  const opMeta = useUserMetadata(op?.pubkey ?? null);
  const lastMeta = useUserMetadata(lastMsg?.pubkey ?? null);
  if (!op || !lastMsg) return null;
  const opName = opMeta?.displayName || opMeta?.name || `${op.pubkey.slice(0, 8)}…`;
  const lastName =
    lastMeta?.displayName || lastMeta?.name || `${lastMsg.pubkey.slice(0, 8)}…`;
  const lastAt = lastMsg.createdAt;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="lc-card w-full text-left p-3 hover:border-lc-green/40 transition-colors"
    >
      <div className="flex items-start gap-3">
        {opMeta?.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={opMeta.picture} alt="" className="w-8 h-8 rounded-full shrink-0 object-cover" />
        ) : (
          <div className="w-8 h-8 rounded-full bg-lc-border shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-lc-white truncate">
            {thread.name || '(untitled thread)'}
          </div>
          <div className="text-xs text-lc-muted line-clamp-2 mt-0.5 break-words">
            {op.content}
          </div>
          <div className="flex flex-wrap gap-x-3 text-[11px] text-lc-muted mt-1.5">
            <span>OP {opName}</span>
            <span>{messages.length} {messages.length === 1 ? 'msg' : 'msgs'}</span>
            <span>last {lastName} · {formatTimeAgo(lastAt)}</span>
          </div>
        </div>
        {thread.picture && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thread.picture}
            alt=""
            className="w-12 h-12 rounded-lg object-cover shrink-0"
          />
        )}
      </div>
    </button>
  );
}

function NewThreadModal({
  forumGroupId,
  isPublic,
  isOpen,
  onClose,
  onCreated,
}: {
  forumGroupId: string;
  isPublic: boolean;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (childId: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = useSignerReady();
  const myPubkey = useMyPubkey();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || submitting || !myPubkey) return;
    setSubmitting(true);
    setError(null);
    try {
      // Create a new child NIP-29 group, pinned to this forum via `parent`.
      // Inheriting public/open from the forum means thread visibility tracks
      // the container's policy by default.
      const childId = await nostrActions.createGroup({
        name: title.trim(),
        about: undefined,
        isPublic,
        isOpen,
        parent: forumGroupId,
      });
      // Post the OP body as the first kind 9 message in the new child group.
      // The relay will fan it out and the thread becomes visible in the forum
      // list (per the "show threads with ≥ 1 message" rule).
      await nostrActions.sendMessage(childId, body.trim());
      onCreated(childId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="lc-card w-full max-w-xl max-h-[85vh] overflow-y-auto p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-lc-white">New thread</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-lc-muted hover:text-lc-white text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Thread title"
          maxLength={140}
          className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green/60"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="First message…"
          rows={6}
          className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green/60 resize-y"
        />
        {error && <div className="text-xs text-red-400">{error}</div>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="lc-pill-secondary text-xs px-4 py-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!ready || submitting || !title.trim() || !body.trim()}
            className="lc-pill-primary text-xs px-4 py-2 disabled:opacity-40"
          >
            {submitting ? 'Creating…' : 'Create thread'}
          </button>
        </div>
      </form>
    </div>
  );
}

function formatTimeAgo(unixSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
