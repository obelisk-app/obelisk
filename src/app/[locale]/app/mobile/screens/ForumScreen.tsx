'use client';

import { shortHost } from '@/utils/relay-url/url-host';
import { useCurrentRelayUrl } from '@/services/nostr-bridge';
import { useTranslations } from 'next-intl';
import { ForumSortSheet } from '../sheets/ForumSortSheet';
import { NewThreadSheet } from '../sheets/NewThreadSheet';
import { ForumChrome } from './forum/ForumChrome';
import { MobileForumCard } from './forum/MobileForumCard';
import { useForumScreen } from '@/hooks/app/mobile/screens/forum/useForumScreen';
import BackButton from '../BackButton';

/**
 * Mobile equivalent of `src/components/chat/ForumView`. Same Discord-style
 * chrome (search-or-create, sort sheet, tag chips) and same UX rule that
 * empty / aborted threads stay hidden until their first message - but laid
 * out for a phone screen and styled with the mobile CSS primitives.
 *
 * Gallery view is intentionally not exposed on mobile: at the column count
 * a phone can sensibly show, gallery cards land at roughly the same size as
 * list cards and the toggle isn't worth the dropdown real-estate.
 */
export function ForumScreen({
  groupId,
  back,
  selectChild,
}: {
  groupId: string;
  back: () => void;
  selectChild: (childId: string) => void;
}) {
  const t = useTranslations();
  const relay = useCurrentRelayUrl();
  const forum = useForumScreen(groupId);
  const { group, forumTags, children, visibleThreads, threadsLoading, searchQuery } = forum;

  return (
    <div className="screen forum-screen active" data-screen="forum">
      <div className="chat-header">
        <div className="chat-breadcrumb">
          <BackButton onClick={back} style={{ marginLeft: -6 }} />
          <span className="space-name-bc">{shortHost(relay)}</span>
          <span className="sep">/</span>
          <span>{group?.name ?? t('mobile.forum.label')}</span>
        </div>
        <div className="chat-row">
          <div className="chat-title-block">
            <div className="chat-channel"><span className="hash">#</span>{group?.name ?? t('mobile.forum.label')}</div>
            <span className="role-badge" style={{ marginLeft: 6 }}>{t('mobile.forum.label')}</span>
          </div>
        </div>
      </div>

      <ForumChrome forum={forum} />

      <div className="forum-list native-scroll-y">
        {threadsLoading ? (
          <div className="empty-state" data-testid="mobile-forum-loading">
            <div className="empty-state-title">{t('chat.forum.loading')}</div>
          </div>
        ) : children.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">{t('mobile.forum.empty')}</div>
            <div className="empty-state-desc">{t('mobile.forum.emptyHint')}</div>
          </div>
        ) : visibleThreads.length === 0 ? (
          <div className="empty-state" data-testid="mobile-forum-no-matches">
            <div className="empty-state-title">
              {searchQuery.trim()
                ? t('mobile.forum.noMatchesQuery', { query: searchQuery.trim() })
                : t('mobile.forum.noMatchesTags')}
            </div>
            {searchQuery.trim() && (
              <button
                type="button"
                className="forum-new-pill"
                onClick={() => forum.openNewThread(searchQuery.trim())}
                style={{ marginTop: 10 }}
              >
                {t('mobile.forum.createNamed', { title: searchQuery.trim() })}
              </button>
            )}
          </div>
        ) : (
          visibleThreads.map((c) => (
            <MobileForumCard
              key={c.id}
              group={c}
              forumTags={forumTags}
              onClick={() => selectChild(c.id)}
            />
          ))
        )}
      </div>

      {forum.showNewThread && (
        <NewThreadSheet
          forumGroupId={groupId}
          forumTags={forumTags}
          initialTitle={forum.prefillTitle}
          isPublic={group?.isPublic ?? true}
          isHidden={group?.isHidden ?? false}
          isRestricted={group?.isRestricted ?? false}
          isOpen={group?.isOpen ?? true}
          close={forum.closeNewThread}
          onCreated={(childId) => {
            forum.closeNewThread();
            forum.setSearchQuery('');
            selectChild(childId);
          }}
        />
      )}
      {forum.showSort && (
        <ForumSortSheet
          prefs={forum.prefs}
          onChange={forum.updatePrefs}
          close={() => forum.setShowSort(false)}
        />
      )}
    </div>
  );
}
