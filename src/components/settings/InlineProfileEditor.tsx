'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '@/store/auth';
import { fetchCurrentKind0, publishProfile, getSigner } from '@/lib/nostr';
import { uploadToBlossom } from '@/lib/blossom';

/**
 * Inline (non-modal) editor for the caller's Nostr profile (kind 0).
 *
 * Edits name/about/picture/banner/website/lud16/nip05 and publishes via
 * `publishProfile`, which merges the new values into the existing kind 0
 * so unknown fields set by other clients are never stripped.
 */
export default function InlineProfileEditor() {
  const { profile, syncProfile } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<null | 'picture' | 'banner'>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState('');
  const [about, setAbout] = useState('');
  const [pictureUrl, setPictureUrl] = useState('');
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [website, setWebsite] = useState('');
  const [lud16, setLud16] = useState('');
  const [nip05, setNip05] = useState('');

  useEffect(() => {
    if (!profile?.pubkey) return;
    fetchCurrentKind0(profile.pubkey).then((m) => {
      setMeta(m);
      setName((m.display_name as string) || (m.name as string) || '');
      setAbout((m.about as string) || '');
      setPictureUrl((m.picture as string) || (m.image as string) || '');
      setBannerUrl((m.banner as string) || '');
      setWebsite((m.website as string) || '');
      setLud16((m.lud16 as string) || '');
      setNip05((m.nip05 as string) || '');
      setLoading(false);
    });
  }, [profile?.pubkey]);

  useEffect(() => () => {
    if (picturePreview) URL.revokeObjectURL(picturePreview);
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
  }, [picturePreview, bannerPreview]);

  const pickFile = (kind: 'picture' | 'banner', f: File) => {
    if (!f.type.startsWith('image/')) { setError('Solo imágenes'); return; }
    if (f.size > 10 * 1024 * 1024) { setError('Archivo demasiado grande (máx 10 MB)'); return; }
    setError(null);
    if (kind === 'picture') {
      setPictureFile(f);
      if (picturePreview) URL.revokeObjectURL(picturePreview);
      setPicturePreview(URL.createObjectURL(f));
    } else {
      setBannerFile(f);
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
      setBannerPreview(URL.createObjectURL(f));
    }
  };

  const publish = async () => {
    if (!name.trim()) { setError('El nombre es obligatorio'); return; }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      if (!getSigner()) throw new Error('No hay signer activo');

      let finalPicture = pictureUrl;
      let finalBanner = bannerUrl;
      if (pictureFile) { setUploading('picture'); finalPicture = await uploadToBlossom(pictureFile); }
      if (bannerFile)  { setUploading('banner');  finalBanner  = await uploadToBlossom(bannerFile); }
      setUploading(null);

      await publishProfile({
        name: name.trim(),
        display_name: name.trim(),
        about: about.trim() || undefined,
        picture: finalPicture || undefined,
        banner: finalBanner || undefined,
        website: website.trim() || undefined,
        lud16: lud16.trim() || undefined,
        nip05: nip05.trim() || undefined,
      });
      await syncProfile();
      setPictureFile(null);
      setBannerFile(null);
      setPictureUrl(finalPicture);
      setBannerUrl(finalBanner);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Error al publicar');
    } finally {
      setSaving(false);
      setUploading(null);
    }
  };

  if (loading) {
    return <div className="lc-card p-6"><div className="lc-spinner" /></div>;
  }

  const currentPicture = picturePreview || pictureUrl;
  const currentBanner = bannerPreview || bannerUrl;
  const unknownFieldCount = Object.keys(meta).filter(
    (k) => !['name', 'display_name', 'picture', 'image', 'about', 'banner', 'website', 'lud16', 'nip05'].includes(k),
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lc-white text-xl font-semibold">Perfil</h2>
        <p className="text-sm text-lc-muted mt-1">
          Estos datos se publican como un evento <span className="font-mono">kind 0</span> en Nostr. Los campos
          desconocidos de tu perfil actual se preservan intactos{unknownFieldCount > 0 ? ` (${unknownFieldCount} extra)` : ''}.
        </p>
      </div>

      {/* Banner preview + uploader */}
      <section className="lc-card overflow-hidden">
        <div
          className="h-32 w-full bg-gradient-to-br from-lc-olive to-lc-black relative"
          style={currentBanner ? { backgroundImage: `url(${currentBanner})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
        >
          <button
            onClick={() => bannerInputRef.current?.click()}
            className="absolute top-3 right-3 lc-pill-secondary text-xs"
          >
            {currentBanner ? 'Cambiar banner' : 'Subir banner'}
          </button>
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile('banner', f); }}
          />
        </div>
        <div className="px-5 pb-5 -mt-12">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="relative w-24 h-24 rounded-full border-4 border-lc-dark overflow-hidden cursor-pointer group bg-lc-olive"
          >
            {currentPicture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentPicture} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-lc-green text-3xl font-semibold">
                {name ? name[0].toUpperCase() : '?'}
              </div>
            )}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-xs text-lc-white transition">
              Cambiar
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile('picture', f); }}
            />
          </div>
        </div>
      </section>

      {/* Fields grid */}
      <section className="lc-card p-5 grid gap-4 md:grid-cols-2">
        <Field label="Nombre" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            className={fieldCls}
          />
        </Field>
        <Field label="NIP-05" hint="user@domain.tld · identidad verificable">
          <input value={nip05} onChange={(e) => setNip05(e.target.value)} placeholder="user@domain.tld" className={fieldCls} />
        </Field>
        <Field label="Sitio web">
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." className={fieldCls} />
        </Field>
        <Field label="Lightning (lud16)" hint="necesario para recibir zaps por LNURL">
          <input value={lud16} onChange={(e) => setLud16(e.target.value)} placeholder="you@walletofsatoshi.com" className={fieldCls} />
        </Field>
        <div className="md:col-span-2">
          <Field label="Bio" hint={`${about.length}/300`}>
            <textarea
              value={about}
              onChange={(e) => setAbout(e.target.value)}
              maxLength={300}
              rows={4}
              className={`${fieldCls} resize-none`}
            />
          </Field>
        </div>
      </section>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={publish} disabled={saving} className="lc-pill-primary text-sm disabled:opacity-50">
          {uploading === 'picture' ? 'Subiendo foto...'
            : uploading === 'banner' ? 'Subiendo banner...'
            : saving ? 'Publicando...'
            : 'Guardar y publicar'}
        </button>
        {saved && <span className="text-xs text-lc-green">✓ Perfil actualizado</span>}
      </div>
    </div>
  );
}

const fieldCls =
  'w-full bg-lc-black border border-lc-border rounded-xl px-3 py-2.5 text-sm text-lc-white placeholder:text-lc-muted/50 focus:outline-none focus:border-lc-green/50';

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-lc-muted font-medium uppercase tracking-wide">
          {label}{required && <span className="text-red-400"> *</span>}
        </span>
        {hint && <span className="text-[10px] text-lc-muted">{hint}</span>}
      </div>
      {children}
    </label>
  );
}
