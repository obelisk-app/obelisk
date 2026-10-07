'use client';

import { useState } from 'react';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { PlayIcon } from '@/assets/icons';

/**
 * Click-to-play YouTube facade. The iframe (and every Google cookie and
 * tracker that rides with it) is only created once the user actually
 * asks for the video. Until then this is one static thumbnail, which is
 * both the privacy-preserving choice and the reason the landing page
 * doesn't pay for a third-party player it may never show.
 */
interface YouTubeEmbedProps {
  videoId: string;
  /**
   * Wrapper sizing. Defaults to chat-bubble scale; the landing page
   * passes its own so the same facade can run full-width. Owns sizing
   * only: the frame, radius and border are constant across surfaces.
   */
  className?: string;
  /** Accessible title for the player and thumbnail, in the reader's language. */
  title: string;
  /**
   * Thumbnail resolution. `mq` (320×180) is right for a chat bubble;
   * `maxres` (1280×720) for a full-width hero. `maxres` does not exist
   * for every upload, so it falls back to `hqdefault`, which always does.
   */
  thumbnailRes?: 'mq' | 'maxres';
}

const DEFAULT_WRAPPER = 'max-w-lg w-full mt-1';

export default function YouTubeEmbed({
  videoId,
  className = DEFAULT_WRAPPER,
  title,
  thumbnailRes = 'mq',
}: YouTubeEmbedProps) {
  const [loaded, setLoaded] = useState(false);
  const [fellBack, setFellBack] = useState(false);
  const thumbnailUrl = fellBack
    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    : `https://img.youtube.com/vi/${videoId}/${thumbnailRes}default.jpg`;

  if (!loaded) {
    return (
      <button
        type="button"
        onClick={() => setLoaded(true)}
        className={`relative block rounded-lg overflow-hidden border border-lc-border hover:border-lc-green/40 transition-colors group/yt ${className}`}
        aria-label={title}
        data-testid="youtube-thumbnail"
      >
        <RemoteImage
          src={thumbnailUrl}
          alt=""
          className="w-full aspect-video object-cover"
          onError={() => setFellBack(true)}
        />
        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover/yt:bg-black/20 transition-colors">
          <div className="w-14 h-10 bg-red-600 rounded-lg flex items-center justify-center">
            <PlayIcon size={20} fill="white" />
          </div>
        </div>
      </button>
    );
  }

  return (
    <div
      className={`rounded-lg overflow-hidden border border-lc-border ${className}`}
      data-testid="youtube-iframe"
    >
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full aspect-video"
        loading="lazy"
      />
    </div>
  );
}
