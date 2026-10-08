import type { MediaCategory } from '@/utils/chat/picker/media-catalog';
import { BallIcon, CatIcon, ImageIcon, LaughIcon, HeartIcon, PartyIcon, RecentIcon, SmileIcon, TrendingIcon } from '@/assets/icons';

/** The icon on one GIF / sticker category tab. */
export function MediaCategoryGlyph({ category }: { category: MediaCategory }) {
  if (category === 'Recent') return <RecentIcon size={null} data-testid="recent-icon" className="h-5 w-5" />;
  if (category === 'Trending') return <TrendingIcon size={null} className="h-5 w-5" />;
  if (category === 'Reactions') return <SmileIcon size={null} className="h-5 w-5" />;
  if (category === 'Funny') return <LaughIcon size={null} className="h-5 w-5" />;
  if (category === 'Love') return <HeartIcon size={null} className="h-5 w-5" />;
  if (category === 'Celebration') return <PartyIcon size={null} className="h-5 w-5" />;
  if (category === 'Animals') return <CatIcon size={null} className="h-5 w-5" />;
  if (category === 'Sports') return <BallIcon size={null} className="h-5 w-5" />;
  return <ImageIcon size={null} className="h-5 w-5" />;
}
