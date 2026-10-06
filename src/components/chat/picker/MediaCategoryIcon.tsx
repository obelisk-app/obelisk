import type { MediaCategory } from './media-catalog';
import { RecentIcon } from './RecentIcon';

export function MediaCategoryIcon({ category }: { category: MediaCategory }) {
  const props = { className: 'h-5 w-5', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (category === 'Recent') return <RecentIcon />;
  if (category === 'Trending') return <svg {...props}><path d="m4 16 5-5 4 4 7-8" /><path d="M15 7h5v5" /></svg>;
  if (category === 'Reactions') return <svg {...props}><circle cx="12" cy="12" r="8" /><path d="M9 10h.01M15 10h.01M8.5 14s1.2 2 3.5 2 3.5-2 3.5-2" /></svg>;
  if (category === 'Funny') return <svg {...props}><circle cx="12" cy="12" r="8" /><path d="m8 10 2-1-2-1m8 2-2-1 2-1M8.5 14h7c-.8 2-2 3-3.5 3s-2.7-1-3.5-3Z" /></svg>;
  if (category === 'Love') return <svg {...props}><path d="M20 9c0 5-8 10-8 10S4 14 4 9a4 4 0 0 1 7-2.6A4 4 0 0 1 20 9Z" /></svg>;
  if (category === 'Celebration') return <svg {...props}><path d="m5 19 4-10 6 6-10 4ZM13 5l1-2m3 6 3-1m-2 5 2 1M9 4 8 2" /></svg>;
  if (category === 'Animals') return <svg {...props}><path d="m6 9-1-5 5 3h4l5-3-1 5a7 7 0 1 1-12 0Z" /><path d="M9 12h.01M15 12h.01M10 15h4" /></svg>;
  if (category === 'Sports') return <svg {...props}><circle cx="12" cy="12" r="8" /><path d="m9 9 3-2 3 2-1 4h-4L9 9Zm1 4-3 2m7-2 3 2m-5-8V4m-2 15 2-3 2 3" /></svg>;
  return <svg {...props}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="m7 15 3-3 3 3 2-2 2 2M8 9h.01" /></svg>;
}
