'use client';

import Button from '@/components/ui/buttons/Button';
import { tagChipStyle } from '@/utils/chat/forum/forum-tag-colors';
import { useTranslations } from 'next-intl';
import Input from '@/components/ui/forms/Input';
import { MobileTagDot } from './MobileTagDot';
import type { ForumScreenState } from '@/hooks/shell/mobile/screens/forum/useForumScreen';
import { PlusIcon, SearchIcon, SortIcon } from '@/assets/icons';
import Form from '@/components/ui/forms/Form';

/** Search-or-create, the + pill, the sort chip and the tag filter chips. */
export function ForumChrome({ forum }: { forum: ForumScreenState }) {
  const t = useTranslations();
  const { searchQuery, setSearchQuery, canCreateFromSearch, openNewThread, selectedTagIds, query } = forum;
  const allActive = selectedTagIds.length === 0;
  return (
    <div className="forum-chrome" data-testid="mobile-forum-chrome">
      <Form className="forum-search-row" onSubmit={forum.submitSearch}>
        <div className="search-input-wrap">
          <SearchIcon size={null} strokeWidth={2} />
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
            <Button
              variant="bare"
              type="button"
              className="search-clear"
              onClick={() => setSearchQuery('')}
              aria-label={t('mobile.forum.clearSearch')}
            >
              ✕
            </Button>
          )}
        </div>
        <Button
          variant="bare"
          type="button"
          className="forum-new-pill"
          // The placeholder tells the user to "Tap + to create", so + has
          // to carry the text they typed, it used to discard it and open
          // an empty composer.
          onClick={() => openNewThread(query)}
          data-testid="mobile-forum-new-thread-btn"
          aria-label={t('chat.forum.new')}
        >
          <PlusIcon size={null} strokeWidth={2} />
        </Button>
      </Form>
      <div className="forum-filter-row">
        <Button
          variant="bare"
          type="button"
          className="forum-chip muted"
          onClick={() => forum.setShowSort(true)}
          data-testid="mobile-forum-sort-trigger"
        >
          <SortIcon size={null} strokeWidth={2} />
          {t('chat.forum.sort')}
        </Button>
        {forum.forumTags.map((tag) => (
          <Button
            variant="bare"
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
          </Button>
        ))}
        <Button
          variant="bare"
          type="button"
          className={`forum-chip ${allActive ? '' : 'muted'}`}
          onClick={forum.clearTags}
          data-testid="mobile-forum-tag-all"
          aria-pressed={allActive}
        >
          {t('mobile.search.all')}
        </Button>
      </div>
    </div>
  );
}
