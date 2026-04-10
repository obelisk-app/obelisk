'use client';

import { useEffect, useState } from 'react';

interface OgData {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

// Client-side cache to avoid re-fetching during session
const ogCache = new Map<string, OgData | null>();

export default function LinkPreview({ url }: { url: string }) {
  const [data, setData] = useState<OgData | null>(ogCache.get(url) ?? null);
  const [loading, setLoading] = useState(!ogCache.has(url));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (ogCache.has(url)) {
      setData(ogCache.get(url) ?? null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed');
        return res.json();
      })
      .then((og: OgData) => {
        if (cancelled) return;
        // Only cache and show if we have meaningful data
        if (og.title || og.description) {
          ogCache.set(url, og);
          setData(og);
        } else {
          ogCache.set(url, null);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        ogCache.set(url, null);
        setError(true);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [url]);

  if (error || (!loading && !data)) return null;

  if (loading) {
    return (
      <div className="mt-1 max-w-md border border-lc-border rounded-lg overflow-hidden bg-lc-dark" data-testid="link-preview-loading">
        <div className="p-3 space-y-2">
          <div className="lc-skeleton h-3 w-20" />
          <div className="lc-skeleton h-4 w-48" />
          <div className="lc-skeleton h-3 w-64" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 max-w-md border-l-4 border-lc-green/40 rounded-r-lg overflow-hidden bg-lc-dark block hover:bg-lc-border/30 transition-colors"
      data-testid="link-preview"
    >
      <div className="flex">
        <div className="flex-1 p-3 min-w-0">
          {data.siteName && (
            <p className="text-xs text-lc-muted mb-0.5">{data.siteName}</p>
          )}
          {data.title && (
            <p className="text-sm font-medium text-lc-green truncate">{data.title}</p>
          )}
          {data.description && (
            <p className="text-xs text-lc-muted mt-0.5 line-clamp-2">{data.description}</p>
          )}
        </div>
        {data.image && (
          <img
            src={data.image}
            alt=""
            className="w-20 h-20 object-cover shrink-0"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
      </div>
    </a>
  );
}
