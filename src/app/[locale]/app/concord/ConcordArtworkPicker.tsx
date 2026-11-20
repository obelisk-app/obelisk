'use client';

import { useTranslations } from 'next-intl';
import { concordArtworkUrl } from '@/assets/illustrations/concord';
import { CONCORD_ARTWORK_PRESETS, type ConcordArtworkPreset } from '@/constants/chat/concord-artwork';
import Button from '@/components/ui/buttons/Button';
import RemoteImage from '@/components/ui/media/RemoteImage';

export default function ConcordArtworkPicker({ slot, selected, onSelect }: {
  slot: 'icon' | 'banner';
  selected: ConcordArtworkPreset | '';
  onSelect: (preset: ConcordArtworkPreset | '') => void;
}) {
  const t = useTranslations('chat.concord.artwork');

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-lc-white">{t(slot)}</legend>
      <div className="grid grid-cols-4 gap-2">
        {CONCORD_ARTWORK_PRESETS.map((preset) => (
          <Button key={preset} variant="bare" aria-pressed={selected === preset}
            data-testid={`artwork-${slot}-${preset}`} onClick={() => onSelect(preset)}
            className="min-w-0 overflow-hidden rounded-lg border border-lc-border bg-lc-card text-lc-muted hover:border-lc-green/60 aria-pressed:border-lc-green aria-pressed:text-lc-white focus-visible:outline-2 focus-visible:outline-lc-green">
            <RemoteImage src={concordArtworkUrl(preset, slot)} alt=""
              className={slot === 'icon' ? 'mx-auto mt-2 size-10 rounded-md' : 'aspect-[2/1] w-full object-cover'} />
            <span className="block truncate px-1 py-1 text-xs">{t(preset)}</span>
          </Button>
        ))}
      </div>
      {selected && <Button variant="ghost" size="xs" onClick={() => onSelect('')}>{t('clear')}</Button>}
    </fieldset>
  );
}
