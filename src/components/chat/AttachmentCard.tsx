'use client';

interface AttachmentCardProps {
  url: string;
  name: string;
}

export default function AttachmentCard({ url, name }: AttachmentCardProps) {
  const ext = (name.split('.').pop() || 'file').toUpperCase().slice(0, 5);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={name}
      className="mt-1 inline-flex items-center gap-3 max-w-sm border border-lc-border rounded-lg bg-lc-dark px-3 py-2 hover:bg-lc-border/40 transition-colors no-underline"
      data-testid="attachment-card"
    >
      <div className="shrink-0 w-10 h-10 rounded bg-lc-border/60 flex items-center justify-center">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-lc-green">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-lc-white truncate">{name}</p>
        <p className="text-xs text-lc-muted">{ext}</p>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-lc-muted shrink-0">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </a>
  );
}
