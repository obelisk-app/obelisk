import { useTranslations } from 'next-intl';
import type { MediaPickerTab } from '@/utils/chat/picker/media-catalog';

/** Emoji / GIF / Stickers switch along the picker's bottom edge. */
export function PickerTabs({
  tab,
  onTab,
}: {
  tab: MediaPickerTab;
  onTab: (tab: MediaPickerTab) => void;
}) {
  const t = useTranslations();
  return (
    <div className="flex h-12 shrink-0 items-center border-t border-lc-border px-2">
      {(['emoji', 'gif', 'sticker'] as const).map((value) => (
        <button
          type="button"
          key={value}
          onClick={() => onTab(value)}
          aria-pressed={tab === value}
          className={`h-full flex-1 border-b-2 text-xs font-semibold uppercase tracking-wide ${tab === value ? 'border-lc-green text-lc-green' : 'border-transparent text-lc-white/80 hover:text-lc-white'}`}
        >
          {t(`chat.mediaPicker.tab.${value}`)}
        </button>
      ))}
    </div>
  );
}
