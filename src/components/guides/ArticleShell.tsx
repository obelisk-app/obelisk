import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Locale } from '@/i18n';
import type { GuideFrontmatter } from '@/lib/guides';
import { HERO_REGISTRY } from './svg';

interface Props {
  frontmatter: GuideFrontmatter;
  locale: Locale;
  slug: string;
  readMinutes: number;
  backHref: string;
  backLabel: string;
  readTimeLabel: string;
  updatedLabel: string;
  children: ReactNode;
}

export default function ArticleShell({
  frontmatter,
  readMinutes,
  backHref,
  backLabel,
  readTimeLabel,
  updatedLabel,
  children,
}: Props) {
  const Hero = HERO_REGISTRY[frontmatter.heroComponent];
  const published = new Date(frontmatter.publishedAt);
  const updated = new Date(frontmatter.updatedAt || frontmatter.publishedAt);

  return (
    <article className="max-w-3xl mx-auto px-6 pt-28 pb-24" data-testid="article-shell">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 text-sm text-lc-muted hover:text-lc-green transition-colors mb-6"
      >
        <span aria-hidden="true">←</span> {backLabel}
      </Link>

      <header className="mb-8">
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {frontmatter.tags?.map((t) => (
            <span
              key={t}
              className="text-[11px] px-2 py-0.5 rounded-full bg-lc-olive-dark text-lc-green font-mono"
            >
              #{t}
            </span>
          ))}
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-lc-white tracking-tight leading-tight">
          {frontmatter.title}
        </h1>
        <p className="mt-4 text-lg text-lc-muted leading-relaxed">{frontmatter.description}</p>

        <div className="mt-6 flex items-center gap-4 text-xs text-lc-muted flex-wrap">
          <span>
            {readMinutes} {readTimeLabel}
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={updated.toISOString()}>
            {updatedLabel} {updated.toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </time>
        </div>
      </header>

      {Hero && (
        <div className="mb-10 rounded-xl overflow-hidden border border-lc-border bg-lc-dark">
          <Hero />
        </div>
      )}

      <div className="guide-prose">{children}</div>

      <footer className="mt-16 pt-8 border-t border-lc-border text-sm text-lc-muted">
        <time dateTime={published.toISOString()}>
          Published {published.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </time>
      </footer>
    </article>
  );
}
