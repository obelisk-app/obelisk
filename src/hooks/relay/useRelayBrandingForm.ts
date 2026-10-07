'use client';

import { useState, type FormEvent } from 'react';
import { publishBranding, type RelayBranding } from '@/services/relay/relay-branding';
import { useTranslations } from 'next-intl';
import { errorText } from '@/utils/errors/error-text';

export interface RelayBrandingForm {
  readonly icon: string;
  readonly banner: string;
  readonly name: string;
  readonly description: string;
  readonly saving: boolean;
  readonly error: string | null;
  readonly setIcon: (value: string) => void;
  readonly setBanner: (value: string) => void;
  readonly setName: (value: string) => void;
  readonly setDescription: (value: string) => void;
  /** Trim every field, publish the kind 30078 branding doc, then `onSaved`. */
  readonly save: () => Promise<void>;
  /** A form's `onSubmit`: stays on the page and saves. */
  readonly submit: (event: FormEvent) => void;
}

/**
 * The relay branding editor, headless. `EditBrandingSheet` (phone) and
 * `RelayBrandingModal` (desktop) were the same six `useState`s and the same
 * `publishBranding` call written twice; each now only renders.
 */
export function useRelayBrandingForm(
  relayUrl: string,
  branding: RelayBranding,
  onSaved: () => void,
): RelayBrandingForm {
  const t = useTranslations();
  const [icon, setIcon] = useState(branding.icon);
  const [banner, setBanner] = useState(branding.banner);
  const [name, setName] = useState(branding.name);
  const [description, setDescription] = useState(branding.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await publishBranding(relayUrl, {
        icon: icon.trim(),
        banner: banner.trim(),
        name: name.trim(),
        description: description.trim(),
        updatedAt: Math.floor(Date.now() / 1000),
      });
      onSaved();
    } catch (err) {
      setError(errorText(t, err, 'mobile.branding.saveFailed'));
    } finally {
      setSaving(false);
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save();
  };

  return { icon, banner, name, description, saving, error, setIcon, setBanner, setName, setDescription, save, submit };
}
