'use client';

import { useEffect, useRef, useState } from 'react';
import { nostrActions, useSignerReady } from '@/services/nostr-bridge';
import { BlossomUploadError, uploadToBlossom } from '@/services/media/blossom';
import { useTranslations } from 'next-intl';
import { errorText } from '@/utils/errors/error-text';

export interface ProfileEditorInitial {
  readonly displayName?: string | null;
  readonly name?: string | null;
  readonly about?: string | null;
  readonly picture?: string | null;
  readonly banner?: string | null;
  readonly nip05?: string | null;
  readonly lud16?: string | null;
  readonly website?: string | null;
}

export type ProfileUploading = 'picture' | 'banner' | null;

export interface ProfileEditorForm {
  readonly name: string;
  readonly about: string;
  readonly picture: string;
  readonly banner: string;
  readonly nip05: string;
  readonly lud16: string;
  readonly website: string;
  readonly pictureFile: File | null;
  readonly bannerFile: File | null;
  /** Every setter marks the form dirty, so a late kind 0 never clobbers typing. */
  readonly setName: (value: string) => void;
  readonly setAbout: (value: string) => void;
  readonly setPicture: (value: string) => void;
  readonly setBanner: (value: string) => void;
  readonly setNip05: (value: string) => void;
  readonly setLud16: (value: string) => void;
  readonly setWebsite: (value: string) => void;
  readonly setPictureFile: (file: File | null) => void;
  readonly setBannerFile: (file: File | null) => void;
  readonly uploading: ProfileUploading;
  readonly saving: boolean;
  /** Saving or uploading. */
  readonly busy: boolean;
  readonly error: string | null;
  readonly setError: (message: string | null) => void;
  readonly nameValid: boolean;
  /** Check the signer, upload any picked files, publish kind 0, then `onSaved`. */
  readonly save: () => Promise<void>;
}

/**
 * The kind 0 profile editor, headless. `UserPanel`'s `EditProfileForm` and
 * the phone `EditProfileScreen` each had the seven fields, the dirty flag,
 * the hydrate-from-metadata effect and the save sequence written out.
 *
 * The save order is desktop's: the signer check comes before the Blossom
 * uploads, so an edit the user cannot sign does not burn storage for every
 * image they tried. Mobile used to upload first and check afterwards.
 */
export function useProfileEditorForm(initial: ProfileEditorInitial | null, onSaved: () => void): ProfileEditorForm {
  const t = useTranslations();
  const signerReady = useSignerReady();
  const [name, setNameState] = useState(initial?.displayName || initial?.name || '');
  const [about, setAboutState] = useState(initial?.about || '');
  const [picture, setPictureState] = useState(initial?.picture || '');
  const [banner, setBannerState] = useState(initial?.banner || '');
  const [nip05, setNip05State] = useState(initial?.nip05 || '');
  const [lud16, setLud16State] = useState(initial?.lud16 || '');
  const [website, setWebsiteState] = useState(initial?.website || '');
  const [pictureFile, setPictureFileState] = useState<File | null>(null);
  const [bannerFile, setBannerFileState] = useState<File | null>(null);
  const [uploading, setUploading] = useState<ProfileUploading>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once the user has typed into any field we stop overwriting their edits
  // when fresh kind 0 metadata arrives from a relay.
  const dirtyRef = useRef(false);
  const dirty = <T,>(set: (value: T) => void) => (value: T) => { dirtyRef.current = true; set(value); };

  // Hydrate when metadata arrives. The editor often opens before the bridge
  // has the kind 0 cached (cold relay or first paint), so `initial` is null
  // on mount and fills in as soon as the metadata lands.
  useEffect(() => {
    if (!initial || dirtyRef.current) return;
    setNameState(initial.displayName || initial.name || '');
    setAboutState(initial.about || '');
    setPictureState(initial.picture || '');
    setBannerState(initial.banner || '');
    setNip05State(initial.nip05 || '');
    setLud16State(initial.lud16 || '');
    setWebsiteState(initial.website || '');
  }, [initial]);

  const nameValid = name.trim().length > 0;
  const busy = saving || uploading !== null;

  async function save() {
    if (busy) return;
    if (!nameValid) { setError(t('shell.user.nameRequired')); return; }
    if (!signerReady) { setError(t('shell.user.notSignedIn')); return; }
    setSaving(true);
    setError(null);
    try {
      // Uploads are deferred to save so an abandoned edit doesn't burn
      // Blossom storage for every image the user tried.
      let finalPicture = picture.trim();
      let finalBanner = banner.trim();
      if (pictureFile) {
        setUploading('picture');
        finalPicture = await uploadToBlossom(pictureFile);
      }
      if (bannerFile) {
        setUploading('banner');
        finalBanner = await uploadToBlossom(bannerFile);
      }
      setUploading(null);
      await nostrActions.editUserMetadata({
        name: name.trim(),
        displayName: name.trim(),
        about: about.trim(),
        picture: finalPicture,
        banner: finalBanner,
        nip05: nip05.trim(),
        lud16: lud16.trim(),
        website: website.trim(),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof BlossomUploadError
        ? t('media.error.uploadFailed')
        : errorText(t, err, 'shell.user.publishFailed'));
    } finally {
      setUploading(null);
      setSaving(false);
    }
  }

  return {
    name, about, picture, banner, nip05, lud16, website, pictureFile, bannerFile,
    setName: dirty(setNameState),
    setAbout: dirty(setAboutState),
    setPicture: dirty(setPictureState),
    setBanner: dirty(setBannerState),
    setNip05: dirty(setNip05State),
    setLud16: dirty(setLud16State),
    setWebsite: dirty(setWebsiteState),
    setPictureFile: dirty(setPictureFileState),
    setBannerFile: dirty(setBannerFileState),
    uploading, saving, busy, error, setError, nameValid, save,
  };
}
