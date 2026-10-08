import type { ComponentProps } from 'react';
import { Link as LocaleLink } from '@/i18n/navigation';
import { linkClass, safeLinkRel, usesLocaleNavigation, type LinkVariant } from '@/utils/style/link';
import type { ButtonSize, ButtonVariant } from '@/utils/style/button-class';

export type LinkProps = ComponentProps<typeof LocaleLink> & {
  variant?: LinkVariant;
  /** Button looks share the button primitive's recipes; links still render anchors. */
  buttonVariant?: ButtonVariant;
  size?: ButtonSize;
  /** Root-relative files need browser navigation, without a locale prefix. */
  native?: boolean;
};

/**
 * One anchor for text, cards and navigation CTAs. App paths keep next-intl's
 * routing, locale and prefetch controls; external URLs, hash references and
 * downloads retain native browser semantics. This is not a URL sanitizer:
 * rendered user content keeps its own validation and protocol handlers.
 * No client boundary: static link content can stay on the server.
 */
export default function Link({
  variant = 'plain', buttonVariant = 'pill', size = 'md', native = false,
  href, download, target, rel, className, children,
  locale, prefetch, replace, scroll, onNavigate, ...rest
}: LinkProps) {
  const classes = linkClass(variant, buttonVariant, size, className);
  const safeRel = safeLinkRel(target, rel);
  if (typeof href === 'string' && !usesLocaleNavigation(href, download, native)) {
    return <a href={href} download={download} target={target} rel={safeRel} className={classes} {...rest}>{children}</a>;
  }
  return (
    <LocaleLink href={href} download={download} target={target} rel={safeRel} className={classes}
      locale={locale} prefetch={prefetch} replace={replace} scroll={scroll} onNavigate={onNavigate} {...rest}>
      {children}
    </LocaleLink>
  );
}
