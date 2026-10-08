import { useActivityLog } from '@/hooks/feedback/useActivityLog';
import { usePreferences } from '@/hooks/preferences/usePreferences';
import type { ActivityEntry } from '@/services/feedback/activity-log';
import { visibleActivity } from '@/utils/feedback/activity';

/**
 * The desktop activity stack's view model: the row to show from the
 * activity log, honouring the "show activity" preference
 * (docs/ui/conventions.md#component-files).
 */
export function useActivityIndicator(hideSigning: boolean): ActivityEntry[] {
  const items = useActivityLog();
  const { showActivityIndicator } = usePreferences();
  return visibleActivity(items, { show: showActivityIndicator, hideSigning });
}
