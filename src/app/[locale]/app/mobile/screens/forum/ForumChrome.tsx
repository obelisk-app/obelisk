'use client';

import { tagChipStyle } from '@/utils/chat/forum/forum-tag-colors';
import { useTranslations } from 'next-intl';
import Input from '@/components/ui/forms/Input';
import { MobileTagDot } from './MobileTagDot';
import type { ForumScreenState } from '@/hooks/shell/mobile/screens/forum/useForumScreen';

/** Search-or-create, the + pill, the sort chip and the tag filter chips. */
export function ForumChrome({ forum }: { forum: ForumScreenState }) {
  const t = useTranslations();
  const { searchQuery, setSearchQuery, canCreateFromSearch, openNewThread, selectedTagIds } = forum;
  const allActive = selectedTagIds.length === 0;
  return (
    <div className="forum-chrome" data-testid="mobile-forum-chrome">
      <form
        className="forum-search-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (canCreateFromSearch) openNewThread(searchQuery.trim());
        }}
      >
        <div className="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <Input
            variant="bare"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t(canCreateFromSearch ? 'mobile.forum.tapToCreate' : 'mobile.forum.searchPlaceholder')}
            aria-label={t('chat.forum.searchPlaceholder')}
            data-testid="mobile-forum-search-input"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear"
              onClick={() => setSearchQuery('')}
              aria-label={t('mobile.forum.clearSearch')}
            >
              ✕
            </button>
          )}
        </div>
        <button
          type="button"
          className="forum-new-pill"
          // The placeholder tells the user to "Tap + to create", so + has
          // to carry the text they typed, it used to discard it and open
          // an empty composer.
          onClick={() => openNewThread(searchQuery.trim())}
          data-testid="mobile-forum-new-thread-btn"
          aria-label={t('chat.forum.new')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </form>
      <div className="forum-filter-row">
        <button
          type="button"
          className="forum-chip muted"
          onClick={() => forum.setShowSort(true)}
          data-testid="mobile-forum-sort-trigger"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 4v16" /><path d="m3 8 4-4 4 4" /><path d="M17 20V4" /><path d="m21 16-4 4-4-4" /></svg>
          {t('chat.forum.sort')}
        </button>
        {forum.forumTags.map((tag) => (
          <button
            key={tag.id}
            type="button"
            className="forum-chip"
            // Inline so the per-tag color wins over the neutral
            // `.forum-chip` rule in mobile-shell.css.
            style={tagChipStyle(tag, selectedTagIds.includes(tag.id))}
            onClick={() => forum.toggleTag(tag.id)}
            data-testid={`mobile-forum-tag-${tag.id}`}
            aria-pressed={selectedTagIds.includes(tag.id)}
          >
            {tag.emoji ? <span>{tag.emoji}</span> : <MobileTagDot tag={tag} />}
            <span>{tag.name}</span>
          </button>
        ))}
        <button
          type="button"
          className={`forum-chip ${allActive ? '' : 'muted'}`}
          onClick={forum.clearTags}
          data-testid="mobile-forum-tag-all"
          aria-pressed={allActive}
        >
          {t('mobile.search.all')}
        </button>
      </div>
    </div>
  );
}
