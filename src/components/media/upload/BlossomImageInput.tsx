'use client';

/**
 * Image URL input with a Blossom upload button: same visual pattern as the
 * legacy obelisk admin (preview thumbnail · URL input · "Upload" pill).
 *
 * Reuse anywhere a user can pick an image URL: profile picture/banner,
 * group icon/banner, emoji uploads, etc. Falls back gracefully when the
 * Blossom servers are unreachable: shows the upload error inline; the URL
 * field stays usable.
 */

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import ErrorState from '@/components/ui/feedback/ErrorState';
import FileInput from '@/components/ui/forms/FileInput';
import Input from '@/components/ui/forms/Input';
import RemoteImage from '@/components/ui/media/RemoteImage';
import { useBlossomImageInput } from '@/hooks/media/upload/useBlossomImageInput';
import Label from '@/components/ui/forms/Label';
import Text from '@/components/ui/layout/Text';

interface Props {
  label: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  /** Thumbnail aspect: `square` for icons/avatars, `wide` for banners. */
  shape?: 'square' | 'wide';
  /** Optional helper text rendered under the input. */
  hint?: React.ReactNode;
  /** Restrict the file picker (default: any image). */
  accept?: string;
  /** Hide the inline thumbnail when a parent renders a larger combined preview. */
  showPreview?: boolean;
}

export default function BlossomImageInput({
  label,
  value,
  onChange,
  placeholder,
  shape = 'square',
  hint,
  accept = 'image/*',
  showPreview = true,
}: Props) {
  const t = useTranslations();
  const urlId = useId();
  const { uploading, error, picked } = useBlossomImageInput(onChange);

  const thumbCls =
    shape === 'wide'
      ? 'w-24 h-12 rounded-lg object-cover bg-lc-black border border-lc-border'
      : 'w-12 h-12 rounded-lg object-cover bg-lc-black border border-lc-border';
  const placeholderCls =
    shape === 'wide'
      ? 'w-24 h-12 rounded-lg bg-lc-black border border-lc-border'
      : 'w-12 h-12 rounded-lg bg-lc-black border border-lc-border';

  return (
    <div>
      <Label variant="caps" htmlFor={urlId} className="block mb-1.5">{label}</Label>
      <div className="flex items-center gap-3">
        {showPreview && (value ? (
          <RemoteImage src={value} alt="" className={thumbCls} />
        ) : (
          <div className={placeholderCls} />
        ))}
        <Input
          id={urlId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? t('media.blossom.urlPlaceholder')}
          className="flex-1 transition-colors"
        />
        <Label className="lc-pill lc-pill-secondary text-xs cursor-pointer whitespace-nowrap">
          {t(uploading ? 'media.blossom.uploading' : 'media.blossom.upload')}
          <FileInput
            accept={accept}
            disabled={uploading}
            onChange={(e) => picked(e.target)}
          />
        </Label>
      </div>
      {error && <ErrorState className="mt-1.5">{error}</ErrorState>}
      {hint && <Text as="p" size="11" tone="muted" className="mt-1.5">{hint}</Text>}
    </div>
  );
}
