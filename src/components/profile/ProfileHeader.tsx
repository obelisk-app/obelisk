'use client';

import { useState } from 'react';

interface ProfileHeaderProps {
  pubkey: string;
  displayName: string | null;
  picture: string | null;
  nip05: string | null;
  about: string | null;
}

export default function ProfileHeader({
  pubkey,
  displayName,
  picture,
  nip05,
  about,
}: ProfileHeaderProps) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(pubkey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="lc-card p-6 flex gap-4 items-start" data-testid="profile-header">
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={picture}
          alt={displayName || 'avatar'}
          className="w-20 h-20 rounded-full border border-lc-border object-cover"
        />
      ) : (
        <div className="w-20 h-20 rounded-full bg-lc-border" />
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold text-lc-white truncate">
          {displayName || 'Anonymous'}
        </h1>
        {nip05 && <p className="text-xs text-lc-green truncate">{nip05}</p>}
        <button
          onClick={copy}
          className="text-xs font-mono text-lc-muted hover:text-lc-white mt-1 break-all text-left"
          data-testid="copy-pubkey-btn"
        >
          {pubkey}
          <span className="ml-2 text-lc-green">{copied ? '✓ copied' : ''}</span>
        </button>
        {about && <p className="text-sm text-lc-muted mt-2 whitespace-pre-wrap">{about}</p>}
      </div>
    </div>
  );
}
