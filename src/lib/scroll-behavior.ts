/**
 * Whether an animated scroll is welcome.
 *
 * The mobile shell used to set `scroll-behavior: smooth` on every scroller,
 * with a `prefers-reduced-motion` block turning it back off. That property
 * applied to *programmatic* scrolls too, so a deep link into a long feed
 * animated its way down hundreds of rows instead of arriving — which is why
 * the CSS is gone.
 *
 * An explicit `behavior: 'smooth'` in a `scrollTo` call wins over the
 * element's computed `scroll-behavior`, so the reduced-motion preference can
 * no longer be honoured in CSS. It has to be asked here instead.
 */
export function scrollBehavior(preferred: ScrollBehavior = 'smooth'): ScrollBehavior {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return preferred;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : preferred;
  } catch {
    // Older jsdom and some embedded webviews throw on an unsupported query.
    return preferred;
  }
}
