/** A kind 0 profile as the editor reads it (any field may be missing). */
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

/** The profile editor's fields: the seven kind 0 texts and the picked picture and banner files (uploaded on save). */
export type ProfileFormValues = {
  name: string;
  about: string;
  picture: string;
  banner: string;
  nip05: string;
  lud16: string;
  website: string;
  pictureFile: File | null;
  bannerFile: File | null;
};

/** Which picked image is uploading now. */
export type ProfileUploading = 'picture' | 'banner' | null;

/** Profile publication mode and the calling session action's cancellation guard. */
export interface ProfileEditOptions {
  create?: boolean;
  assertCurrent?: () => void;
}
