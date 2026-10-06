'use client';

/**
 * How the joined room lays its participants out: a pinned or presenting
 * stage with a rail of everyone else, or, without one, a video grid over
 * an audio strip. The rules deciding who is where are `stage-layout.ts`;
 * this is their rendering.
 */
import type { Dispatch, SetStateAction } from 'react';
import { ScrollableRail } from './chrome';
import { AudioChip, AudioTile, RailAudioTile, RailVideoTile, Stage, VideoTile } from './tiles';
import type { ActiveStage, TracksByPubkey } from './stage-layout';

export function StageArea({
  activeStage, pinned, setPinned, videoPubkeys, audioPubkeys, selfPubkey, localCamStream, tracksByPubkey,
}: {
  activeStage: ActiveStage | null;
  pinned: string | null;
  setPinned: Dispatch<SetStateAction<string | null>>;
  videoPubkeys: string[];
  audioPubkeys: string[];
  selfPubkey: string;
  localCamStream: MediaStream | null;
  tracksByPubkey: TracksByPubkey;
}) {
  const hasStage = !!activeStage;
  return (
    <>
    {/* Stage area */}
    <div className="relative z-10 flex-1 min-h-0 flex flex-col md:flex-row gap-2 sm:gap-3 p-2 sm:p-3 pb-24 sm:pb-28 overflow-hidden">
      {hasStage ? (
        <>
          {/* Main stage */}
          <div className="flex-1 min-h-0 min-w-0 flex flex-col">
            <Stage
              pubkey={activeStage!.pubkey}
              isLocal={activeStage!.isLocal}
              kind={activeStage!.kind}
              videoStream={activeStage!.videoStream}
              pinned={pinned === activeStage!.pubkey}
              onTogglePin={() => setPinned((p) => (p === activeStage!.pubkey ? null : activeStage!.pubkey))}
            />
          </div>

          {/* Side rail (desktop) / bottom strip (mobile) - everyone, click to pin */}
          <ScrollableRail>
            {videoPubkeys.map((pk) => (
              <RailVideoTile
                key={pk}
                pubkey={pk}
                isLocal={pk === selfPubkey}
                videoStream={pk === selfPubkey ? localCamStream : (tracksByPubkey.get(pk)?.camera?.stream ?? null)}
                isPinned={pinned === pk}
                isStage={activeStage!.pubkey === pk}
                onClick={() => setPinned((p) => (p === pk ? null : pk))}
              />
            ))}
            {audioPubkeys.map((pk) => (
              <RailAudioTile
                key={pk}
                pubkey={pk}
                isLocal={pk === selfPubkey}
              />
            ))}
          </ScrollableRail>
        </>
      ) : (
        /* No screen-share: tiled video grid + audio strip */
        <div className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
          {videoPubkeys.length > 0 && (
            <div className="flex-1 min-h-0 overflow-hidden flex items-center justify-center" data-testid="video-grid">
              {videoPubkeys.length === 1 ? (
                <div className="max-w-full max-h-full aspect-video w-auto h-full">
                  <VideoTile
                    pubkey={videoPubkeys[0]}
                    isLocal={videoPubkeys[0] === selfPubkey}
                    videoStream={videoPubkeys[0] === selfPubkey ? localCamStream : (tracksByPubkey.get(videoPubkeys[0])?.camera?.stream ?? null)}
                    onPin={() => setPinned(videoPubkeys[0])}
                    fit="contain"
                    fillParent
                  />
                </div>
              ) : (
                <div
                  className={
                    'grid gap-2 sm:gap-3 w-full h-full auto-rows-fr min-h-0 ' +
                    (videoPubkeys.length === 2
                      ? 'grid-cols-1 sm:grid-cols-2'
                      : videoPubkeys.length === 3
                        ? 'grid-cols-1 sm:grid-cols-3'
                        : videoPubkeys.length === 4
                          ? 'grid-cols-2'
                          : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4')
                  }
                >
                  {videoPubkeys.map((pk) => (
                    <VideoTile
                      key={pk}
                      pubkey={pk}
                      isLocal={pk === selfPubkey}
                      videoStream={pk === selfPubkey ? localCamStream : (tracksByPubkey.get(pk)?.camera?.stream ?? null)}
                      onPin={() => setPinned(pk)}
                      fit="cover"
                      fillParent
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {audioPubkeys.length > 0 && videoPubkeys.length === 0 && (
            <div className="flex-1 min-h-0 flex items-center justify-center" data-testid="audio-participants">
              <div
                className={
                  'grid gap-3 sm:gap-4 ' +
                  (audioPubkeys.length === 1
                    ? 'grid-cols-1'
                    : audioPubkeys.length === 2
                      ? 'grid-cols-2'
                      : audioPubkeys.length <= 4
                        ? 'grid-cols-2 sm:grid-cols-2'
                        : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4')
                }
              >
                {audioPubkeys.map((pk) => (
                  <AudioTile
                    key={pk}
                    pubkey={pk}
                    isLocal={pk === selfPubkey}
                  />
                ))}
              </div>
            </div>
          )}

          {audioPubkeys.length > 0 && videoPubkeys.length > 0 && (
            <div className="shrink-0 flex gap-2 overflow-x-auto pb-1" data-testid="audio-participants">
              {audioPubkeys.map((pk) => (
                <AudioChip
                  key={pk}
                  pubkey={pk}
                  isLocal={pk === selfPubkey}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>

    </>
  );
}
