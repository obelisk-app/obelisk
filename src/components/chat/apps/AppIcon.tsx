'use client';

/**
 * An app's picture — the file its manifest's `icon` tag names, which must be
 * one of its own pinned paths. Loaded through bundle.ts like any app file, so
 * it is sha256-verified and cached by hash; a server can't swap it.
 *
 * Shown as an image element from a blob: URL. An SVG drawn as an image never
 * runs script and can't make requests, so an app-supplied picture is safe to
 * draw here, outside the sandbox. Until it loads (or when there is none) the
 * generic mark shows.
 */
import { useEffect, useState } from 'react';

import { AppsIcon, GamepadIcon } from '@/components/ui/icons';
import { loadPathBlob } from '@/lib/apps/bundle';
import type { AppManifest } from '@/lib/apps/manifest';

const IMAGE_TYPES = /^image\/(svg\+xml|png|jpeg|webp|gif|avif)$/;

export default function AppIcon({ manifest, size = 36 }: { manifest: AppManifest | null | undefined; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);
  const iconPath = manifest?.icon ? manifest.paths.find((p) => p.path === manifest.icon) : undefined;
  const key = iconPath?.sha256 ?? null;

  useEffect(() => {
    if (!iconPath) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    Promise.resolve()
      .then(() => loadPathBlob(iconPath, manifest?.servers ?? []))
      .then((blob) => {
        if (cancelled || !(blob instanceof Blob) || !IMAGE_TYPES.test(blob.type)) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => { /* fall back to the generic mark */ });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
    // Keyed on the pinned hash: same file, same image.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-lg object-cover"
        style={{ width: size, height: size }}
        data-testid="app-icon-image"
      />
    );
  }
  const isGame = manifest ? manifest.types.includes('game') : true;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg bg-lc-green/15 text-lc-green"
      style={{ width: size, height: size }}
      data-testid="app-icon-fallback"
    >
      {isGame ? <GamepadIcon size={Math.round(size / 2)} /> : <AppsIcon size={Math.round(size / 2)} />}
    </span>
  );
}
