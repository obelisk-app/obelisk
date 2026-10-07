'use client';

import type { BioSegment } from '@/utils/chat/profile/profile-links';

/** One piece of a bio: text, or a link (a web link opens in a new tab). */
export function BioSegmentView({ segment }: { segment: BioSegment }) {
  if (segment.type === 'text') return <span>{segment.value}</span>;
  return (
    <a
      href={segment.href}
      target={segment.href.startsWith('http') ? '_blank' : undefined}
      rel="noopener noreferrer"
      className="text-lc-green underline decoration-lc-green/40 underline-offset-2 hover:decoration-lc-green"
      data-testid="profile-bio-link"
    >
      {segment.value}
    </a>
  );
}
