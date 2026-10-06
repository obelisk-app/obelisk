'use client';

/**
 * The publications channel's chrome, top to bottom:
 *   - Search-or-create bar: typing filters titles. Enter opens an exact match,
 *     or starts a new publication prefilled with the typed text when there
 *     isn't one.
 *   - Filter row: a "Sort & view" pill (opens a popover for sort order, list
 *     vs gallery, and any/all tag matching), the curated tag chips, and a
 *     trailing "All" chip that clears the tag filter.
 */
import { useSignerReady, type JsForumTag } from '@/services/nostr-bridge';
import { useTranslation } from '@/i18n/context';
import type { ForumPrefs } from '@/services/forum-prefs';
import Input from '@/components/ui/Input';
import { NewPostIcon, SearchIcon } from './forum-icons';
import { SortViewMenu } from './SortViewMenu';
import { TagChip } from './TagChip';
import Button from '@/components/ui/Button';

export function ForumChrome({
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
        <Input
          variant="pill"
          prefix={<SearchIcon />}
          wrapperClassName="flex-1"
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={canCreate ? 'Press Enter to create…' : 'Search or create a publication…'}
          data-testid="forum-search-input"
          aria-label={t('forum.searchPlaceholder')}
        />
        <Button
          variant="pill"
          size="xs"
          onClick={onClickNewThread}
          disabled={!ready}
          className="shrink-0"
          data-testid="forum-new-thread-btn"
          title={ready ? 'New publication' : 'Sign in to start a publication'}
        >
          <NewPostIcon />
          <span className="hidden sm:inline">{t('forum.new')}</span>
        </Button>
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
