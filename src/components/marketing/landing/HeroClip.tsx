'use client';

import Image from 'next/image';
import { useHeroClip } from '@/hooks/marketing/useHeroClip';

type HeroClipProps = {
  webm: string;
  mp4: string;
  poster: string;
  width: number;
  height: number;
  alt: string;
  sizes: string;
  priority?: boolean;
};

/** A product loop over its poster frame: the picture paints first, the video fades in once it plays. */
export default function HeroClip({ webm, mp4, poster, width, height, alt, sizes, priority }: HeroClipProps) {
  const { ref, playing } = useHeroClip();
  return (
    <div className="relative">
      <Image src={poster} alt={alt} width={width} height={height} priority={priority} sizes={sizes} className="block h-auto w-full" />
      <video
        ref={ref}
        aria-hidden="true"
        width={width}
        height={height}
        muted
        loop
        playsInline
        disablePictureInPicture
        preload="none"
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${playing ? 'opacity-100' : 'opacity-0'}`}
      >
        <source src={webm} type="video/webm" />
        <source src={mp4} type="video/mp4" />
      </video>
    </div>
  );
}
