'use client';

/**
 * The gear popover of the in-room control pill: the outbound camera
 * quality cap and the incoming-quality hint, one segmented selector each.
 * The store is the source of truth; the active client is told afterwards.
 */
import { useVoiceStore } from '@/store/voice';
import { getActiveVoiceClient } from '@/services/voice/active-client';
import { voiceErrorCode } from '@/services/voice/errors';
import { VIDEO_QUALITIES, type VideoQuality } from '@/services/voice/quality';
import { useTranslations } from 'next-intl';

export default function QualityPopover() {
  const t = useTranslations();
  const setError = useVoiceStore((s) => s.setError);
  const videoQuality = useVoiceStore((s) => s.videoQuality);
  const receivedVideoQuality = useVoiceStore((s) => s.receivedVideoQuality);
  const setVideoQuality = useVoiceStore((s) => s.setVideoQuality);
  const setReceivedVideoQuality = useVoiceStore((s) => s.setReceivedVideoQuality);

  const handleSetVideoQuality = async (q: VideoQuality) => {
    setVideoQuality(q);
    const client = getActiveVoiceClient();
    if (client) {
      try { await client.applyVideoQuality(q); }
      catch (e) { setError(voiceErrorCode(e, 'quality')); }
    }
  };

  const handleSetReceivedQuality = async (q: VideoQuality) => {
    setReceivedVideoQuality(q);
    const client = getActiveVoiceClient();
    if (client) {
      try { await client.broadcastReceivedQuality(q); }
      catch (e) { setError(voiceErrorCode(e, 'quality')); }
    }
  };

  return (
    <div
      className="absolute bottom-full mb-3 right-0 w-64 max-w-[calc(100vw-1rem)] rounded-2xl bg-black/90 backdrop-blur-xl border border-white/10 shadow-2xl p-3 text-white/90"
      data-testid="quality-popover"
    >
      <QualitySection
        label={t('voice.myCamera')}
        value={videoQuality}
        onChange={(q) => { void handleSetVideoQuality(q); }}
        testid="quality-out"
      />
      <div className="h-px bg-white/10 my-3" />
      <QualitySection
        label={t('voice.incoming')}
        value={receivedVideoQuality}
        onChange={(q) => { void handleSetReceivedQuality(q); }}
        testid="quality-in"
      />
      <p className="text-[10px] text-white/40 mt-2">{t('voice.audioNote')}</p>
    </div>
  );
}

function QualitySection({
  label,
  value,
  onChange,
  testid,
}: {
  label: string;
  value: VideoQuality;
  onChange: (q: VideoQuality) => void;
  testid: string;
}) {
  return (
    <div data-testid={testid}>
      <div className="text-xs uppercase tracking-wider text-white/50 mb-1.5">{label}</div>
      <div className="grid grid-cols-3 gap-1">
        {VIDEO_QUALITIES.map((q) => (
          <button
            key={q}
            onClick={() => onChange(q)}
            data-testid={`${testid}-${q}`}
            className={
              'min-w-0 px-2 py-1.5 rounded-lg text-xs font-medium transition ' +
              (value === q
                ? 'bg-lc-green/25 text-lc-green ring-1 ring-lc-green/40'
                : 'bg-white/5 text-white/75 hover:bg-white/10')
            }
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
