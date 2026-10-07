'use client';

import VideoTile from './VideoTile';

/** A camera tile in the rail, ringed when it is the one on stage. */
export default function RailVideoTile({ isPinned, isStage, onClick, ...props }: {
  pubkey: string;
  isLocal: boolean;
  videoStream: MediaStream | null;
  isPinned?: boolean;
  isStage?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={
        'shrink-0 w-40 md:w-full md:max-w-full ' +
        (isStage ? 'ring-2 ring-lc-green rounded-xl' : '') +
        (isPinned ? ' opacity-90' : '')
      }
    >
      <VideoTile {...props} onPin={onClick} />
    </div>
  );
}
