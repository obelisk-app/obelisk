'use client';

import { useTranslations } from 'next-intl';
import YouTubeEmbed from '../YouTubeEmbed';

/**
 * A video linked in a chat message, titled in the reader's language. Kept
 * apart from `YouTubeEmbed` because the landing page renders that one too,
 * and its route does not ship the chat messages.
 */
export function ChatYouTubeEmbed({ videoId }: { videoId: string }) {
  const t = useTranslations();
  return <YouTubeEmbed videoId={videoId} title={t('chat.youtubeTitle')} />;
}
