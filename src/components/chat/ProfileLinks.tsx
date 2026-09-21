'use client';

/**
 * The linkable half of a kind-0 profile.
 *
 * The bio, the website and the lightning address were all rendered as flat
 * text, which meant the three most actionable things on a profile had to be
 * selected and copied by hand. Everything here is either a link or a copy
 * button.
 *
 * Link extraction is `bioSegments`, not `MessageContent`: the note pipeline
 * unfurls links into preview cards, which would make a four-line bio taller
 * than the profile above it.
 */

import { bioSegments, normalizeWebsite, prettyUrl } from '@/lib/profile-links';
import { useToastStore } from '@/store/toast';
import { useTranslation } from '@/i18n/context';

export default function ProfileLinks({
  about,
  website,
  lud16,
}: {
  about?: string | null;
  website?: string | null;
  lud16?: string | null;
}) {
  const { t } = useTranslation();
  const segments = bioSegments(about);
  const site = normalizeWebsite(website);

  if (segments.length === 0 && !site && !lud16) return null;

  const copyAddress = () => {
    if (!lud16) return;
    void Promise.resolve(navigator.clipboard?.writeText(lud16)).catch(() => {});
    useToastStore.getState().pushToast({ title: t('profileFeed.addressCopied'), body: lud16 });
  };

  return (
    <div className="profile-view-bio shrink-0 px-5 py-2" data-testid="profile-links">
      {segments.length > 0 && (
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-lc-muted">
          {segments.map((segment, index) => (
            segment.type === 'text'
              ? <span key={index}>{segment.value}</span>
              : (
                <a
                  key={index}
                  href={segment.href}
                  target={segment.href.startsWith('http') ? '_blank' : undefined}
                  rel="noopener noreferrer"
                  className="text-lc-green underline decoration-lc-green/40 underline-offset-2 hover:decoration-lc-green"
                  data-testid="profile-bio-link"
                >
                  {segment.value}
                </a>
              )
          ))}
        </p>
      )}

      {(site || lud16) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {site && (
            <a
              href={site}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-lc-green hover:underline"
              data-testid="profile-website"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              {prettyUrl(site)}
            </a>
          )}
          {lud16 && (
            <button
              type="button"
              onClick={copyAddress}
              className="inline-flex items-center gap-1.5 text-lc-muted hover:text-lc-white"
              data-testid="profile-lud16"
              title={lud16}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z" />
              </svg>
              {lud16}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
