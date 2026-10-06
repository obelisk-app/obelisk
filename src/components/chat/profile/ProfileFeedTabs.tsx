'use client';

import type { ProfileFeedTab } from '@/services/social/profile-feed';
import { useTranslation } from '@/i18n/context';
import SegmentedControl from '@/components/ui/SegmentedControl';

const TABS = ['posts', 'replies', 'articles', 'media'] as const;

/**
 * Pills, not underlined tabs: every other switch in Obelisk
 * (Siguiendo/Global, the filters, the settings tabs) is a segmented
 * pill, and three full-width underlines stretched across a phone read
 * as a different app's chrome.
 */
export function ProfileFeedTabs({ tab, onTab }: { tab: ProfileFeedTab; onTab: (tab: ProfileFeedTab) => void }) {
  const { t } = useTranslation();
  return (
    <div className="profile-feed-tabs sticky top-0 z-[2] flex justify-center border-y border-lc-border bg-lc-black/95 px-4 py-2 backdrop-blur">
      <SegmentedControl
        aria-label={t('profile.title')}
        fit="fill"
        className="max-w-md"
        value={tab}
        onChange={onTab}
        options={TABS.map((value) => ({ value, label: t(`profileFeed.${value}`), testId: `profile-tab-${value}` }))}
      />
    </div>
  );
}
