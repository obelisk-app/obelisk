'use client';

/**
 * Publications channel: a feed of child publications, each with its own chat.
 *
 * Naming note: the wire format still says "forum" everywhere — the
 * `["t","forum"]` channel marker, the `forum-tag` metadata tag, the
 * `channelKind === 'forum'` union member, and every identifier in this file.
 * Only the user-facing vocabulary is "publications"; nothing on the relay
 * changed.
 *
 * Each publication is itself a regular NIP-29 text channel — pinned to its
 * container by the `["parent", forumGroupId]` tag on its kind 9002 metadata.
 * Clicking one navigates the app to that child group, where the existing chat
 * panel takes over. Publications carry optional `["topic", id]` tags that
 * reference container-level tag definitions on its metadata
 * (`["forum-tag", id, name, emoji?, color?]`). The admin curates the tag set;
 * each tag's colour is either chosen there or derived from its id (see
 * `src/lib/forum-tag-colors.ts`).
 *
 * UX rule: only publications with at least one chat message are shown; empty /
 * aborted ones stay hidden until someone speaks. Both list and gallery views
 * observe this rule.
 *
 * Chrome (top → bottom):
 *   - Search-or-create bar: typing filters titles. Enter opens an exact match,
 *     or starts a new publication prefilled with the typed text when there
 *     isn't one.
 *   - Filter row: a "Sort & view" pill (opens a popover for sort order, list
 *     vs gallery, and any/all tag matching), the curated tag chips, and a
 *     trailing "All" chip that clears the tag filter.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useChildrenByParent,
  useGroups,
  useGroupMetadataEose,
  useSignerReady,
  useMessages,
  useMessagesByGroup,
  useMessagesStatus,
  nostrActions,
  useMyPubkey,
  useUserMetadata,
} from '@/lib/nostr-bridge';
import type { JsGroup, JsForumTag, JsMessage } from '@/lib/nostr-bridge';
import { paletteForTag, tagChipStyle } from '@/lib/forum-tag-colors';
import { useTranslation } from '@/i18n/context';

interface Props {
  groupId: string;
  channelName?: string;
  /** Open a publication (child group) as the active view in the host shell. */
  onSelectThread: (childGroupId: string) => void;
}

type SortBy = 'recent' | 'created';
type ViewMode = 'list' | 'gallery';
type TagMatch = 'any' | 'all';

interface ForumPrefs {
  readonly sortBy: SortBy;
  readonly viewMode: ViewMode;
  readonly tagMatch: TagMatch;
}

const DEFAULT_PREFS: ForumPrefs = { sortBy: 'recent', viewMode: 'list', tagMatch: 'any' };

function prefsKey(forumGroupId: string): string {
  return `obelisk-dex/forum-prefs/${forumGroupId}`;
}

function loadPrefs(forumGroupId: string): ForumPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(prefsKey(forumGroupId));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<ForumPrefs>;
    return {
      sortBy: parsed.sortBy === 'created' ? 'created' : 'recent',
      viewMode: parsed.viewMode === 'gallery' ? 'gallery' : 'list',
      tagMatch: parsed.tagMatch === 'all' ? 'all' : 'any',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(forumGroupId: string, prefs: ForumPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(prefsKey(forumGroupId), JSON.stringify(prefs));
  } catch {
    // ignore quota / private-mode failures
  }
}

export default function ForumView({ groupId, channelName, onSelectThread }: Props) {
  void channelName; // title is rendered by the host chat header; no duplicate here
  const childrenByParent = useChildrenByParent();
  const groups = useGroups();
  const groupMetadataEose = useGroupMetadataEose();
  const messagesByGroup = useMessagesByGroup();
  const childIds = childrenByParent[groupId] ?? [];
  const forum = useMemo(() => groups.find((g) => g.id === groupId) ?? null, [groups, groupId]);
  const forumTags: ReadonlyArray<JsForumTag> = forum?.forumTags ?? [];
  const childGroups = useMemo<JsGroup[]>(() => {
    const byId = new Map(groups.map((g) => [g.id, g] as const));
    return childIds.map((id) => byId.get(id)).filter(Boolean) as JsGroup[];
  }, [childIds, groups]);

  const [prefs, setPrefs] = useState<ForumPrefs>(() => loadPrefs(groupId));
  useEffect(() => {
    setPrefs(loadPrefs(groupId));
  }, [groupId]);
  const updatePrefs = (patch: Partial<ForumPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(groupId, next);
      return next;
    });
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<ReadonlyArray<string>>([]);
  const [showNewThread, setShowNewThread] = useState(false);
  const [prefillTitle, setPrefillTitle] = useState('');

  // Reset search + tag filters when the user navigates to a different forum.
  useEffect(() => {
    setSearchQuery('');
    setSelectedTagIds([]);
  }, [groupId]);

  // Derive per-thread "first message" + "last message" so we can sort by
  // recent activity vs creation date and surface the OP excerpt in cards.
  // Threads with zero messages have no first/last and get hidden by the
  // ThreadCard / ThreadGalleryCard themselves (per the forum UX rule).
  const threadActivity = useMemo(() => {
    const map = new Map<string, { first: JsMessage | null; last: JsMessage | null }>();
    for (const t of childGroups) {
      const msgs = messagesByGroup[t.id] ?? [];
      const first = msgs[0] ?? null;
      const last = msgs[msgs.length - 1] ?? null;
      map.set(t.id, { first, last });
    }
    return map;
  }, [childGroups, messagesByGroup]);

  const visibleThreads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = childGroups.filter((t) => {
      if (q && !(t.name ?? '').toLowerCase().includes(q)) return false;
      if (selectedTagIds.length > 0) {
        const threadTagSet = new Set(t.topics);
        if (prefs.tagMatch === 'all') {
          for (const id of selectedTagIds) if (!threadTagSet.has(id)) return false;
        } else {
          if (!selectedTagIds.some((id) => threadTagSet.has(id))) return false;
        }
      }
      return true;
    });
    filtered.sort((a, b) => {
      const aA = threadActivity.get(a.id);
      const bA = threadActivity.get(b.id);
      const aT = prefs.sortBy === 'recent' ? aA?.last?.createdAt ?? 0 : aA?.first?.createdAt ?? 0;
      const bT = prefs.sortBy === 'recent' ? bA?.last?.createdAt ?? 0 : bA?.first?.createdAt ?? 0;
      return bT - aT;
    });
    return filtered;
  }, [childGroups, searchQuery, selectedTagIds, prefs.tagMatch, prefs.sortBy, threadActivity]);

  // "Loading publications…" until the relay has finished its kind 39000 stream.
  // Without this gate the EmptyForum CTA shows instantly even though child
  // groups are still on the wire, which read as "none exist" when
  // really they just hadn't ingested yet.
  const threadsLoading = childGroups.length === 0 && !groupMetadataEose;

  // If the search query has no exact-name match, the bar's submit action
  // opens the new-thread modal prefilled with the typed text.
  const exactMatch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return childGroups.some((t) => (t.name ?? '').toLowerCase() === q);
  }, [childGroups, searchQuery]);

  const openNewThread = (initialTitle = '') => {
    setPrefillTitle(initialTitle);
    setShowNewThread(true);
  };

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
      <ForumChrome
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        exactMatch={exactMatch}
        onSubmitSearch={() => {
          const q = searchQuery.trim();
          if (!q) return;
          if (!exactMatch) { openNewThread(q); return; }
          // Exact title match: Enter should open that thread. It used to do
          // nothing at all, which read as a dead key.
          const match = childGroups.find((c) => (c.name ?? '').toLowerCase() === q.toLowerCase());
          if (match) onSelectThread(match.id);
        }}
        onClickNewThread={() => openNewThread('')}
        prefs={prefs}
        onPrefsChange={updatePrefs}
        forumTags={forumTags}
        selectedTagIds={selectedTagIds}
        onToggleTag={toggleTag}
        onClearTags={() => setSelectedTagIds([])}
      />
      <div className="flex-1 overflow-y-auto p-3">
        {threadsLoading ? (
          <LoadingThreads />
        ) : visibleThreads.length === 0 && childGroups.length === 0 ? (
          <EmptyForum onNewThread={() => openNewThread('')} />
        ) : visibleThreads.length === 0 ? (
          <NoMatchingThreads
            query={searchQuery.trim()}
            hasTagFilter={selectedTagIds.length > 0}
            onCreate={() => openNewThread(searchQuery.trim())}
          />
        ) : prefs.viewMode === 'gallery' ? (
          <ThreadGallery
            threads={visibleThreads}
            forumTags={forumTags}
            onSelectThread={onSelectThread}
          />
        ) : (
          <div className="space-y-2">
            {visibleThreads.map((g) => (
              <ThreadCard
                key={g.id}
                thread={g}
                forumTags={forumTags}
                onOpen={() => onSelectThread(g.id)}
              />
            ))}
          </div>
        )}
      </div>
      {showNewThread && (
        <NewThreadModal
          forumGroupId={groupId}
          forumTags={forumTags}
          initialTitle={prefillTitle}
          isPublic={forum?.isPublic ?? true}
          isHidden={forum?.isHidden ?? false}
          isRestricted={forum?.isRestricted ?? false}
          isOpen={forum?.isOpen ?? true}
          onClose={() => setShowNewThread(false)}
          onCreated={(childId) => {
            setShowNewThread(false);
            setSearchQuery('');
            onSelectThread(childId);
          }}
        />
      )}
    </div>
  );
}

// -- Chrome ----------------------------------------------------------------

function ForumChrome({
  searchQuery,
  onSearchChange,
  exactMatch,
  onSubmitSearch,
  onClickNewThread,
  prefs,
  onPrefsChange,
  forumTags,
  selectedTagIds,
  onToggleTag,
  onClearTags,
}: {
  searchQuery: string;
  onSearchChange: (v: string) => void;
  exactMatch: boolean;
  onSubmitSearch: () => void;
  onClickNewThread: () => void;
  prefs: ForumPrefs;
  onPrefsChange: (p: Partial<ForumPrefs>) => void;
  forumTags: ReadonlyArray<JsForumTag>;
  selectedTagIds: ReadonlyArray<string>;
  onToggleTag: (id: string) => void;
  onClearTags: () => void;
}) {
  const { t } = useTranslation();
  const ready = useSignerReady();
  const canCreate = !exactMatch && searchQuery.trim().length > 0;
  const allActive = selectedTagIds.length === 0;
  return (
    <div className="border-b border-lc-border px-3 py-3 shrink-0 space-y-2.5">
      {/* Row 1: search / create */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmitSearch();
        }}
        className="flex items-center gap-2"
        data-testid="forum-search-row"
      >
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-3 flex items-center text-lc-muted">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={canCreate ? 'Press Enter to create…' : 'Search or create a publication…'}
            className="w-full rounded-full bg-lc-black border border-lc-border pl-10 pr-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green/60 placeholder:text-lc-muted"
            data-testid="forum-search-input"
            aria-label={t('forum.searchPlaceholder')}
          />
        </div>
        <button
          type="button"
          onClick={onClickNewThread}
          disabled={!ready}
          className="lc-pill-primary text-xs px-3 py-2 flex items-center gap-1.5 shrink-0 disabled:opacity-40"
          data-testid="forum-new-thread-btn"
          title={ready ? 'New publication' : 'Sign in to start a publication'}
        >
          <NewPostIcon />
          <span className="hidden sm:inline">{t('forum.new')}</span>
        </button>
      </form>

      {/* Row 2: sort/view dropdown + tag chips + clear */}
      <div className="flex items-center gap-2 flex-wrap">
        <SortViewMenu prefs={prefs} onChange={onPrefsChange} />
        {forumTags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {forumTags.map((tag) => (
              <TagChip
                key={tag.id}
                tag={tag}
                active={selectedTagIds.includes(tag.id)}
                onClick={() => onToggleTag(tag.id)}
              />
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={onClearTags}
          className={
            'rounded-full px-3 py-1 text-xs font-medium transition-colors shrink-0 ' +
            (allActive
              ? 'bg-lc-card text-lc-white border border-lc-border'
              : 'bg-transparent text-lc-muted border border-lc-border hover:text-lc-white hover:border-lc-muted')
          }
          data-testid="forum-tag-all"
          aria-pressed={allActive}
        >
          {t('mobile.search.all')}
        </button>
      </div>
    </div>
  );
}

function TagChip({
  tag,
  active,
  onClick,
}: {
  tag: JsForumTag;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Color is per-tag (admin-chosen or derived from the id), so it has to
      // be an inline style — Tailwind can't emit classes for runtime values.
      style={tagChipStyle(tag, active)}
      className="rounded-full border px-3 py-1 text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0"
      data-testid={`forum-tag-${tag.id}`}
      data-active={active ? 'true' : 'false'}
      aria-pressed={active}
    >
      {tag.emoji
        ? <span className="text-sm leading-none">{tag.emoji}</span>
        : <TagDot tag={tag} />}
      <span className="truncate max-w-[10rem]">{tag.name}</span>
    </button>
  );
}

/** Leading color dot, used when a tag has no emoji of its own. */
function TagDot({ tag }: { tag: JsForumTag }) {
  return (
    <span
      aria-hidden
      className="h-1.5 w-1.5 rounded-full shrink-0"
      style={{ background: paletteForTag(tag).text }}
    />
  );
}

function SortViewMenu({
  prefs,
  onChange,
}: {
  prefs: ForumPrefs;
  onChange: (p: Partial<ForumPrefs>) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-full px-3 py-1 text-xs font-medium flex items-center gap-1.5 bg-lc-card text-lc-white/90 border border-lc-border hover:border-lc-muted transition-colors"
        data-testid="forum-sortview-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <SortIcon />
        <span>{t('forum.sortTitle')}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1.5 z-30 w-60 rounded-xl border border-lc-border bg-lc-dark p-3 shadow-xl space-y-3"
          data-testid="forum-sortview-menu"
        >
          <MenuSection title={t('forum.sortBy')}>
            <RadioRow
              label={t('forum.sortActive')}
              checked={prefs.sortBy === 'recent'}
              onClick={() => onChange({ sortBy: 'recent' })}
              testId="forum-sort-recent"
            />
            <RadioRow
              label={t('forum.sortCreated')}
              checked={prefs.sortBy === 'created'}
              onClick={() => onChange({ sortBy: 'created' })}
              testId="forum-sort-created"
            />
          </MenuSection>
          <MenuSection title={t('forum.viewAs')}>
            <RadioRow
              label={t('forum.viewList')}
              checked={prefs.viewMode === 'list'}
              onClick={() => onChange({ viewMode: 'list' })}
              testId="forum-view-list"
            />
            <RadioRow
              label={t('forum.viewGallery')}
              checked={prefs.viewMode === 'gallery'}
              onClick={() => onChange({ viewMode: 'gallery' })}
              testId="forum-view-gallery"
            />
          </MenuSection>
          <MenuSection title={t('forum.tagMatching')}>
            <RadioRow
              label={t('forum.matchAny')}
              checked={prefs.tagMatch === 'any'}
              onClick={() => onChange({ tagMatch: 'any' })}
              testId="forum-match-any"
            />
            <RadioRow
              label={t('forum.matchAll')}
              checked={prefs.tagMatch === 'all'}
              onClick={() => onChange({ tagMatch: 'all' })}
              testId="forum-match-all"
            />
          </MenuSection>
          <div className="border-t border-lc-border -mx-3" />
          <button
            type="button"
            onClick={() => onChange(DEFAULT_PREFS)}
            className="text-xs text-lc-muted hover:text-lc-white"
            data-testid="forum-sortview-reset"
          >
            {t('forum.reset')}
          </button>
        </div>
      )}
    </div>
  );
}

function MenuSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-lc-muted">{title}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function RadioRow({
  label,
  checked,
  onClick,
  testId,
}: {
  label: string;
  checked: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between gap-2 px-1.5 py-1 rounded hover:bg-lc-card/60 text-left"
      role="menuitemradio"
      aria-checked={checked}
      data-testid={testId}
      data-checked={checked ? 'true' : 'false'}
    >
      <span className="text-sm text-lc-white">{label}</span>
      <span
        className={
          'h-3.5 w-3.5 rounded-full border-2 shrink-0 ' +
          (checked ? 'border-lc-green bg-lc-green' : 'border-lc-border')
        }
      />
    </button>
  );
}

// -- Thread renderings -----------------------------------------------------

function ThreadGallery({
  threads,
  forumTags,
  onSelectThread,
}: {
  threads: ReadonlyArray<JsGroup>;
  forumTags: ReadonlyArray<JsForumTag>;
  onSelectThread: (id: string) => void;
}) {
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      data-testid="forum-gallery"
    >
      {threads.map((g) => (
        <ThreadGalleryCard
          key={g.id}
          thread={g}
          forumTags={forumTags}
          onOpen={() => onSelectThread(g.id)}
        />
      ))}
    </div>
  );
}

function ThreadCardSkeleton({ thread, onOpen }: { thread: JsGroup; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="lc-card w-full text-left p-3 opacity-70 hover:opacity-100 hover:border-lc-green/40 transition-all"
      data-testid="thread-card-skeleton"
      data-thread-id={thread.id}
      aria-label={`Open ${thread.name ?? 'publication'} (still loading)`}
    >
      <div className="flex items-start gap-3">
        <div className="lc-skeleton-circle w-8 h-8 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-lc-white truncate">
            {thread.name || '(loading publication)'}
          </div>
          <div className="lc-skeleton h-3 w-3/4 mt-1.5" />
          <div className="flex flex-wrap gap-x-3 mt-2">
            <span className="lc-skeleton h-2 w-16 inline-block" />
            <span className="lc-skeleton h-2 w-12 inline-block" />
          </div>
        </div>
      </div>
    </button>
  );
}

function ThreadGalleryCardSkeleton({
  thread,
  onOpen,
}: {
  thread: JsGroup;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="lc-card flex flex-col overflow-hidden opacity-70 hover:opacity-100 hover:border-lc-green/40 transition-all text-left"
      data-testid="thread-gallery-card-skeleton"
      data-thread-id={thread.id}
      aria-label={`Open ${thread.name ?? 'publication'} (still loading)`}
    >
      <div className="h-28 w-full bg-lc-black border-b border-lc-border" />
      <div className="p-3 space-y-2">
        <div className="text-sm font-semibold text-lc-white truncate">
          {thread.name || '(loading publication)'}
        </div>
        <div className="lc-skeleton h-3 w-3/4" />
        <div className="lc-skeleton h-2 w-1/2" />
      </div>
    </button>
  );
}

function LoadingThreads() {
  const { t } = useTranslation();
  return (
    <div
      className="flex flex-col items-center justify-center h-full text-center text-lc-muted py-12 gap-3"
      data-testid="threads-loading"
    >
      <div className="lc-spinner" aria-hidden="true" />
      <div className="text-sm">{t('forum.loading')}</div>
    </div>
  );
}

function EmptyForum({ onNewThread }: { onNewThread: () => void }) {
  const { t } = useTranslation();
  const ready = useSignerReady();
  return (
    <div className="flex flex-col items-center justify-center h-full text-center text-lc-muted py-12">
      <div className="text-sm">{t('forum.emptyDesktop')}</div>
      {ready && (
        <button
          type="button"
          onClick={onNewThread}
          className="mt-3 text-lc-green hover:text-lc-green/80 text-sm font-medium"
        >
          {t('forum.startFirst')}
        </button>
      )}
    </div>
  );
}

function NoMatchingThreads({
  query,
  hasTagFilter,
  onCreate,
}: {
  query: string;
  hasTagFilter: boolean;
  onCreate: () => void;
}) {
  const ready = useSignerReady();
  return (
    <div
      className="flex flex-col items-center justify-center h-full text-center text-lc-muted py-12 gap-2"
      data-testid="forum-no-matches"
    >
      <div className="text-sm">
        No publications match{' '}
        {query ? <span className="text-lc-white">&ldquo;{query}&rdquo;</span> : 'the selected tags'}
        {query && hasTagFilter ? ' with the current tag filter' : ''}.
      </div>
      {ready && query && (
        <button
          type="button"
          onClick={onCreate}
          className="lc-pill-primary text-xs px-3 py-1.5 mt-2"
          data-testid="forum-create-from-search"
        >
          Create &ldquo;{query}&rdquo;
        </button>
      )}
    </div>
  );
}

/**
 * Resolve a thread's topic ids against the forum container's curated tag
 * definitions. Unknown ids (the forum admin deleted a tag that's still
 * stamped on an old thread) are silently dropped — the thread keeps showing
 * but loses that chip.
 */
function resolveTopics(
  topics: ReadonlyArray<string>,
  forumTags: ReadonlyArray<JsForumTag>,
): JsForumTag[] {
  if (topics.length === 0 || forumTags.length === 0) return [];
  const byId = new Map(forumTags.map((t) => [t.id, t] as const));
  const seen = new Set<string>();
  const out: JsForumTag[] = [];
  for (const id of topics) {
    if (seen.has(id)) continue;
    seen.add(id);
    const ft = byId.get(id);
    if (ft) out.push(ft);
  }
  return out;
}

/**
 * Thread card (list view). Three states:
 *   - messages.length > 0                             → full render (OP + last + counts)
 *   - messages.length === 0, status !== empty-confirmed → skeleton placeholder
 *   - messages.length === 0, status === empty-confirmed → return null (truly empty)
 *
 * Confidence comes from the bridge's retry ladder — it stays in
 * `empty-unconfirmed` while it re-fires the kind 9 REQ a few times
 * against auth-gated / silent-filtering relays before promoting to
 * `empty-confirmed`. The card flickers less and never hides a thread
 * that genuinely has messages just because the first EOSE landed empty.
 *
 * The skeleton is clickable: opening the thread sets it as the bridge's
 * active group, which bumps its kind 9 REQ to the head of the queue.
 */
function ThreadCard({
  thread,
  forumTags,
  onOpen,
}: {
  thread: JsGroup;
  forumTags: ReadonlyArray<JsForumTag>;
  onOpen: () => void;
}) {
  const messages = useMessages(thread.id);
  const messagesStatus = useMessagesStatus(thread.id);
  const op = messages[0] ?? null;
  const lastMsg = messages[messages.length - 1] ?? null;
  // Hooks must run unconditionally — pass `null` while there's nothing to
  // resolve so the user-metadata subscription stays inert until the first
  // message lands.
  const opMeta = useUserMetadata(op?.pubkey ?? null);
  const lastMeta = useUserMetadata(lastMsg?.pubkey ?? null);
  const tags = useMemo(() => resolveTopics(thread.topics, forumTags), [thread.topics, forumTags]);
  if (!op || !lastMsg) {
    if (messagesStatus === 'empty-confirmed') return null;
    return <ThreadCardSkeleton thread={thread} onOpen={onOpen} />;
  }
  const opName = opMeta?.displayName || opMeta?.name || `${op.pubkey.slice(0, 8)}…`;
  const lastName =
    lastMeta?.displayName || lastMeta?.name || `${lastMsg.pubkey.slice(0, 8)}…`;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="lc-card w-full text-left p-3 hover:border-lc-green/40 transition-colors"
      data-testid="thread-card"
      data-thread-id={thread.id}
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
            {thread.name || '(untitled publication)'}
          </div>
          <div className="text-xs text-lc-muted line-clamp-2 mt-0.5 break-words">
            {op.content}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {tags.map((t) => (
                <InlineTagChip key={t.id} tag={t} />
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-x-3 text-[11px] text-lc-muted mt-1.5">
            <span>OP {opName}</span>
            <span>{messages.length} {messages.length === 1 ? 'msg' : 'msgs'}</span>
            <span>last {lastName} · {formatTimeAgo(lastMsg.createdAt)}</span>
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

/**
 * Gallery card — larger, hero-image-style layout. Uses the thread's banner /
 * picture if present, falling back to the OP avatar. Same three states as
 * the list card.
 */
function ThreadGalleryCard({
  thread,
  forumTags,
  onOpen,
}: {
  thread: JsGroup;
  forumTags: ReadonlyArray<JsForumTag>;
  onOpen: () => void;
}) {
  const messages = useMessages(thread.id);
  const messagesStatus = useMessagesStatus(thread.id);
  const op = messages[0] ?? null;
  const lastMsg = messages[messages.length - 1] ?? null;
  const opMeta = useUserMetadata(op?.pubkey ?? null);
  const tags = useMemo(() => resolveTopics(thread.topics, forumTags), [thread.topics, forumTags]);
  if (!op || !lastMsg) {
    if (messagesStatus === 'empty-confirmed') return null;
    return <ThreadGalleryCardSkeleton thread={thread} onOpen={onOpen} />;
  }
  const opName = opMeta?.displayName || opMeta?.name || `${op.pubkey.slice(0, 8)}…`;
  const heroUrl = thread.banner || thread.picture || opMeta?.picture || null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="lc-card flex flex-col text-left overflow-hidden hover:border-lc-green/40 transition-colors"
      data-testid="thread-gallery-card"
      data-thread-id={thread.id}
    >
      <div className="h-28 w-full bg-lc-black border-b border-lc-border overflow-hidden relative">
        {heroUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lc-muted text-2xl">
            #
          </div>
        )}
        {tags.length > 0 && (
          <div className="absolute left-2 bottom-2 flex flex-wrap gap-1 max-w-[calc(100%-1rem)]">
            {tags.slice(0, 3).map((t) => (
              <InlineTagChip key={t.id} tag={t} />
            ))}
            {tags.length > 3 && (
              <span className="rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-lc-white/90">
                +{tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col gap-1.5">
        <div className="text-sm font-semibold text-lc-white truncate">
          {thread.name || '(untitled publication)'}
        </div>
        <div className="text-xs text-lc-muted line-clamp-3 break-words">{op.content}</div>
        <div className="mt-auto flex items-center justify-between gap-2 text-[11px] text-lc-muted pt-1">
          <span className="truncate">OP {opName}</span>
          <span className="shrink-0">
            {messages.length} {messages.length === 1 ? 'msg' : 'msgs'} ·{' '}
            {formatTimeAgo(lastMsg.createdAt)}
          </span>
        </div>
      </div>
    </button>
  );
}

function InlineTagChip({ tag }: { tag: JsForumTag }) {
  return (
    <span
      style={tagChipStyle(tag)}
      className="rounded-full border px-2 py-0.5 text-[10px] flex items-center gap-1 max-w-[10rem]"
      data-testid={`thread-tag-${tag.id}`}
    >
      {tag.emoji
        ? <span className="leading-none">{tag.emoji}</span>
        : <TagDot tag={tag} />}
      <span className="truncate">{tag.name}</span>
    </span>
  );
}

// -- New thread modal -----------------------------------------------------

function NewThreadModal({
  forumGroupId,
  forumTags,
  initialTitle,
  isPublic,
  isHidden,
  isRestricted,
  isOpen,
  onClose,
  onCreated,
}: {
  forumGroupId: string;
  forumTags: ReadonlyArray<JsForumTag>;
  initialTitle: string;
  isPublic: boolean;
  isHidden: boolean;
  isRestricted: boolean;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (childId: string) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<ReadonlyArray<string>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = useSignerReady();
  const myPubkey = useMyPubkey();
  const MAX_TAGS = 5;

  const toggleTag = (id: string) => {
    setSelectedTagIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_TAGS) return prev;
      return [...prev, id];
    });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || submitting || !myPubkey) return;
    setSubmitting(true);
    setError(null);
    try {
      // Create a new child NIP-29 group, pinned to this forum via `parent`,
      // and stamped with the chosen tag ids. Inheriting public/open from the
      // forum means thread visibility tracks the container's policy.
      const childId = await nostrActions.createGroup({
        name: title.trim(),
        about: undefined,
        isPublic,
        isHidden,
        isRestricted,
        isOpen,
        parent: forumGroupId,
        topics: selectedTagIds,
      });
      // Post the OP body as the first kind 9 message. The forum's UX rule
      // hides empty threads, so this is the moment the thread becomes
      // visible to other readers.
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
      data-testid="new-thread-modal"
    >
      <form
        onSubmit={onSubmit}
        onClick={(e) => e.stopPropagation()}
        className="lc-card w-full max-w-xl max-h-[85vh] overflow-y-auto p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-lc-white">{t('forum.new')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-lc-muted hover:text-lc-white text-sm"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
        <input
          autoFocus
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('forum.titlePlaceholder')}
          maxLength={140}
          className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green/60"
          data-testid="new-thread-title"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('forum.firstMessagePlaceholder')}
          rows={6}
          className="w-full bg-lc-black border border-lc-border rounded-lg px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green/60 resize-y"
          data-testid="new-thread-body"
        />
        {forumTags.length > 0 && (
          <div className="space-y-1.5" data-testid="new-thread-tag-picker">
            <div className="text-[11px] uppercase tracking-wider text-lc-muted">
              Tags ({selectedTagIds.length}/{MAX_TAGS})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {forumTags.map((tag) => {
                const active = selectedTagIds.includes(tag.id);
                const disabled = !active && selectedTagIds.length >= MAX_TAGS;
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    disabled={disabled}
                    style={tagChipStyle(tag, active)}
                    className="rounded-full border px-3 py-1 text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40"
                    data-testid={`new-thread-tag-${tag.id}`}
                    aria-pressed={active}
                  >
                    {tag.emoji
                      ? <span className="text-sm leading-none">{tag.emoji}</span>
                      : <TagDot tag={tag} />}
                    <span className="truncate max-w-[10rem]">{tag.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {error && <div className="text-xs text-red-400">{error}</div>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="lc-pill-secondary text-xs px-4 py-2"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            disabled={!ready || submitting || !title.trim() || !body.trim()}
            className="lc-pill-primary text-xs px-4 py-2 disabled:opacity-40"
            data-testid="new-thread-submit"
          >
            {submitting ? 'Creating…' : 'Create publication'}
          </button>
        </div>
      </form>
    </div>
  );
}

// -- Icons / formatters ---------------------------------------------------

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4v16" />
      <path d="m3 8 4-4 4 4" />
      <path d="M17 20V4" />
      <path d="m21 16-4 4-4-4" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function NewPostIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function formatTimeAgo(unixSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}
