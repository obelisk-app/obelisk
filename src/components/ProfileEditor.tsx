'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '@/i18n/context';
import { fetchCurrentKind0, publishProfile, getNDK } from '@/lib/nostr';
import { uploadToBlossom } from '@/lib/blossom';
import { useAuthStore } from '@/store/auth';

interface ProfileEditorProps {
  mode: 'setup' | 'edit';
  onComplete: () => void;
  onSkip?: () => void;
}

export default function ProfileEditor({ mode, onComplete, onSkip }: ProfileEditorProps) {
  const { t } = useTranslation();
  const { profile, syncProfile } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [pictureUrl, setPictureUrl] = useState('');
  const [about, setAbout] = useState('');
  const [existingMeta, setExistingMeta] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(mode === 'edit');
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);

  // In edit mode, load current kind 0 from relays
  useEffect(() => {
    if (mode === 'edit' && profile?.pubkey) {
      fetchCurrentKind0(profile.pubkey).then((meta) => {
        setExistingMeta(meta);
        setName((meta.display_name as string) || (meta.name as string) || '');
        setPictureUrl((meta.picture as string) || (meta.image as string) || '');
        setAbout((meta.about as string) || '');
        setLoading(false);
      });
    }
  }, [mode, profile?.pubkey]);

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (picturePreview) URL.revokeObjectURL(picturePreview);
    };
  }, [picturePreview]);

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError(t('profileEditor.imageOnly'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError(t('profileEditor.fileTooLarge'));
      return;
    }
    setError(null);
    setPictureFile(file);
    if (picturePreview) URL.revokeObjectURL(picturePreview);
    setPicturePreview(URL.createObjectURL(file));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const currentPicture = picturePreview || pictureUrl;
  const nameValid = name.trim().length > 0;

  const hasChanges = mode === 'setup'
    ? nameValid
    : name !== ((existingMeta.display_name as string) || (existingMeta.name as string) || '') ||
      pictureFile !== null ||
      about !== ((existingMeta.about as string) || '');

  const handleSubmit = () => {
    if (!nameValid) return;
    if (mode === 'edit' && hasChanges) {
      setShowConfirm(true);
    } else {
      doPublish();
    }
  };

  const doPublish = async () => {
    setPublishing(true);
    setError(null);
    try {
      const ndk = getNDK();
      if (!ndk.signer) throw new Error('No signer');

      // Upload picture to Blossom if a file was selected
      let finalPictureUrl = pictureUrl;
      if (pictureFile) {
        setUploading(true);
        try {
          finalPictureUrl = await uploadToBlossom(pictureFile);
        } finally {
          setUploading(false);
        }
      }

      const publishFields: Record<string, string> = {
        name: name.trim(),
        display_name: name.trim(),
      };
      if (finalPictureUrl) publishFields.picture = finalPictureUrl;
      if (about.trim()) publishFields.about = about.trim();

      await publishProfile(publishFields);
      await syncProfile();

      onComplete();
    } catch (err) {
      console.error('Failed to publish profile:', err);
      setError(t('profileEditor.publishError'));
    } finally {
      setPublishing(false);
      setShowConfirm(false);
    }
  };

  const statusText = uploading
    ? t('profileEditor.uploading')
    : publishing
      ? t('profileEditor.publishing')
      : null;

  // Full-screen modal overlay
  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-lc-dark rounded-2xl w-full max-w-lg border border-lc-border shadow-2xl max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex justify-between items-center p-6 pb-0">
          <h2 className="text-xl font-bold text-lc-white">
            {mode === 'setup' ? t('profileEditor.setupTitle') : t('profileEditor.editTitle')}
          </h2>
          <button
            onClick={mode === 'setup' ? onSkip : onComplete}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-lc-border/50 hover:bg-lc-border text-lc-muted hover:text-lc-white transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {mode === 'setup' && (
          <p className="text-sm text-lc-muted px-6 mt-2">{t('profileEditor.setupDesc')}</p>
        )}

        {loading ? (
          <div className="p-6 space-y-4 animate-pulse">
            <div className="h-10 bg-lc-border/50 rounded-xl" />
            <div className="h-32 bg-lc-border/50 rounded-xl" />
            <div className="h-20 bg-lc-border/50 rounded-xl" />
          </div>
        ) : showConfirm ? (
          /* Confirmation screen */
          <div className="p-6 space-y-4">
            <p className="text-sm text-lc-muted">{t('profileEditor.confirmDesc')}</p>

            <div className="space-y-2 p-3 bg-lc-black rounded-xl border border-lc-border">
              {name !== ((existingMeta.display_name as string) || (existingMeta.name as string) || '') && (
                <div className="text-xs">
                  <span className="text-lc-muted">{t('profileEditor.displayName')}:</span>{' '}
                  <span className="text-red-400 line-through">{(existingMeta.display_name as string) || (existingMeta.name as string) || '—'}</span>{' '}
                  <span className="text-lc-green">{name}</span>
                </div>
              )}
              {pictureFile && (
                <div className="text-xs">
                  <span className="text-lc-muted">{t('profileEditor.picture')}:</span>{' '}
                  <span className="text-lc-green">{t('profileEditor.changed')}</span>
                </div>
              )}
              {about !== ((existingMeta.about as string) || '') && (
                <div className="text-xs">
                  <span className="text-lc-muted">{t('profileEditor.aboutLabel')}:</span>{' '}
                  <span className="text-lc-green">{t('profileEditor.changed')}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="flex-1 lc-pill lc-pill-secondary text-sm">
                {t('profileEditor.cancel')}
              </button>
              <button
                onClick={doPublish}
                disabled={publishing || uploading}
                className="flex-1 lc-pill lc-pill-primary text-sm disabled:opacity-50"
              >
                {statusText || t('profileEditor.confirmPublish')}
              </button>
            </div>
          </div>
        ) : (
          /* Main form */
          <div className="p-6 space-y-5">
            {/* Avatar upload area */}
            <div className="flex flex-col items-center gap-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="relative w-24 h-24 rounded-full cursor-pointer group"
              >
                {currentPicture ? (
                  <img
                    src={currentPicture}
                    alt="Avatar"
                    className="w-24 h-24 rounded-full object-cover ring-2 ring-lc-border group-hover:ring-lc-green/50 transition"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-lc-olive flex items-center justify-center text-lc-green text-3xl font-semibold ring-2 ring-lc-border group-hover:ring-lc-green/50 transition">
                    {name ? name[0].toUpperCase() : '?'}
                  </div>
                )}
                {/* Overlay */}
                <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b4f953" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </div>
              <p className="text-xs text-lc-muted">{t('profileEditor.clickToUpload')}</p>
            </div>

            {/* Display Name (mandatory) */}
            <div>
              <label className="block text-xs text-lc-muted font-medium uppercase tracking-wide mb-1">
                {t('profileEditor.displayName')} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('profileEditor.namePlaceholder')}
                maxLength={50}
                className={`w-full bg-lc-black border rounded-xl px-3 py-2.5 text-sm text-lc-white placeholder:text-lc-muted/50 focus:outline-none ${
                  !nameValid && name !== '' ? 'border-red-400/50' : 'border-lc-border focus:border-lc-green/50'
                }`}
              />
            </div>

            {/* About */}
            <div>
              <label className="block text-xs text-lc-muted font-medium uppercase tracking-wide mb-1">
                {t('profileEditor.aboutLabel')}
              </label>
              <textarea
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                placeholder={t('profileEditor.aboutPlaceholder')}
                maxLength={300}
                rows={3}
                className="w-full bg-lc-black border border-lc-border rounded-xl px-3 py-2.5 text-sm text-lc-white placeholder:text-lc-muted/50 focus:outline-none focus:border-lc-green/50 resize-none"
              />
            </div>

            {error && (
              <div className="text-xs text-red-400 text-center p-2 bg-red-500/10 border border-red-500/20 rounded-xl">{error}</div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              {mode === 'setup' && onSkip && (
                <button onClick={onSkip} className="flex-1 lc-pill lc-pill-secondary text-sm">
                  {t('profileEditor.skip')}
                </button>
              )}
              {mode === 'edit' && (
                <button onClick={onComplete} className="flex-1 lc-pill lc-pill-secondary text-sm">
                  {t('profileEditor.cancel')}
                </button>
              )}
              <button
                onClick={handleSubmit}
                disabled={!nameValid || publishing || uploading || (!hasChanges && mode === 'edit')}
                className="flex-1 lc-pill lc-pill-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {statusText || t('profileEditor.publish')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
