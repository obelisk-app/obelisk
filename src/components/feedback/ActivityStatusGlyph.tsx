import type { ActivityEntry } from '@/services/feedback/activity-log';

/** A spinner while pending, a green dot when done, a red dot on failure. */
export default function ActivityStatusGlyph({ status }: { status: ActivityEntry['status'] }) {
  if (status === 'pending') {
    return (
      <span
        className="mt-0.5 inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-lc-green/30 border-t-lc-green"
        aria-hidden
      />
    );
  }
  if (status === 'ok') {
    return (
      <span className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-full bg-lc-green" aria-hidden />
    );
  }
  return (
    <span className="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-full bg-red-500" aria-hidden />
  );
}
