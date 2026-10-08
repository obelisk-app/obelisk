'use client';

import Button from '@/components/ui/buttons/Button';
import type { VideoQuality } from '@/services/voice/quality';
import { VIDEO_QUALITIES } from '@/constants/voice/quality';

/** One quality setting: its label over a three-way segmented choice. */
export default function QualitySection({
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
          <Button
            variant="bare"
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
          </Button>
        ))}
      </div>
    </div>
  );
}
