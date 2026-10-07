/**
 * `next/root-params` for vitest.
 *
 * The real getters read the rendering request's root params, which only
 * exist inside a Next.js render. Here a test names the `[locale]` segment
 * with `setRootLocale` (what the URL would) and the stand-in hands it to
 * whatever reads it: the `[locale]` layout, and next-intl's request config
 * through the `next-intl/server` stand-in.
 */

let segment: string | undefined;

/** The `[locale]` segment of the request under test; `undefined` is a route outside `[locale]`. */
export function setRootLocale(value: string | undefined): void {
  segment = value;
}

/** The segment as set, read synchronously by the other stand-ins. */
export function currentRootLocale(): string | undefined {
  return segment;
}

export async function locale(): Promise<string | undefined> {
  return segment;
}
