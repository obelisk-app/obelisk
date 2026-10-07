import type { ComponentPropsWithoutRef } from 'react';
import { Link } from '@/i18n/navigation';
import Callout from './Callout';
import Shot from './Shot';
import Clip from './Clip';
import { SvgHero } from '@/assets/illustrations/guides';
import Diagram from '@/assets/illustrations/guides/embed/Diagram';
import Mark from '@/assets/illustrations/guides/embed/Mark';

function H2(props: ComponentPropsWithoutRef<'h2'>) {
  return (
    <h2
      className="mt-12 mb-4 text-2xl font-bold text-lc-white tracking-tight scroll-mt-24"
      {...props}
    />
  );
}
function H3(props: ComponentPropsWithoutRef<'h3'>) {
  return (
    <h3
      className="mt-8 mb-3 text-xl font-semibold text-lc-white tracking-tight scroll-mt-24"
      {...props}
    />
  );
}
function P(props: ComponentPropsWithoutRef<'p'>) {
  return <p className="my-4 text-[15px] leading-7 text-lc-white/85" {...props} />;
}
function UL(props: ComponentPropsWithoutRef<'ul'>) {
  return <ul className="my-4 ml-6 list-disc text-[15px] leading-7 text-lc-white/85 marker:text-lc-green" {...props} />;
}
function OL(props: ComponentPropsWithoutRef<'ol'>) {
  return <ol className="my-4 ml-6 list-decimal text-[15px] leading-7 text-lc-white/85 marker:text-lc-green" {...props} />;
}
function LI(props: ComponentPropsWithoutRef<'li'>) {
  return <li className="my-1" {...props} />;
}
const LINK_CLASS = 'text-lc-green underline underline-offset-2 hover:text-lc-green-dark';

/**
 * Internal links are written locale-free in every language
 * (`/guides/web-of-trust`) and go through the locale-aware `Link`, so the
 * Spanish article links to `/es/guides/web-of-trust`.
 */
function A({ href = '', ...props }: ComponentPropsWithoutRef<'a'>) {
  if (href.startsWith('/')) return <Link href={href} className={LINK_CLASS} {...props} />;
  const external = href.startsWith('http');
  return (
    <a
      href={href}
      className={LINK_CLASS}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      {...props}
    />
  );
}
function Code(props: ComponentPropsWithoutRef<'code'>) {
  return (
    <code
      className="px-1.5 py-0.5 rounded bg-lc-olive-dark text-lc-green font-mono text-[13px]"
      {...props}
    />
  );
}
function Pre(props: ComponentPropsWithoutRef<'pre'>) {
  return (
    <pre
      className="my-5 p-4 rounded-xl bg-lc-dark border border-lc-border overflow-x-auto text-[13px] leading-6 font-mono"
      {...props}
    />
  );
}
function Blockquote(props: ComponentPropsWithoutRef<'blockquote'>) {
  return (
    <blockquote
      className="my-6 pl-4 border-l-2 border-lc-green text-lc-muted italic"
      {...props}
    />
  );
}
function HR(props: ComponentPropsWithoutRef<'hr'>) {
  return <hr className="my-10 border-lc-border" {...props} />;
}
function Strong(props: ComponentPropsWithoutRef<'strong'>) {
  return <strong className="text-lc-white font-semibold" {...props} />;
}

export const mdxComponents = {
  h2: H2,
  h3: H3,
  p: P,
  ul: UL,
  ol: OL,
  li: LI,
  a: A,
  code: Code,
  pre: Pre,
  blockquote: Blockquote,
  hr: HR,
  strong: Strong,
  Callout,
  Shot,
  Clip,
  SvgHero,
  Diagram,
  Mark,
};
