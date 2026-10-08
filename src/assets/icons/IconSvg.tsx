import type { ReactNode, SVGProps } from 'react';

/**
 * The props every icon in `src/assets/icons` takes: any `<svg>` attribute
 * (`className`, `style`, `strokeWidth`, `fill`, ...) plus:
 *
 * - `size`: width and height in px, 16 by default. `null` leaves both to the
 *   stylesheet (`className="h-5 w-5"` or a CSS rule), which is how an icon
 *   that a stylesheet sizes keeps no width or height attribute of its own.
 * - `title`: a spoken name for an icon that means something on its own
 *   (no visible label beside it). It renders a `<title>` and the icon stops
 *   being `aria-hidden`; so does an icon given an `aria-label`.
 */
export type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & {
  size?: number | string | null;
  title?: string;
};

/**
 * The frame every icon draws in: a 24-unit grid, a 1.8 stroke in
 * `currentColor` with round caps and joins, no fill, hidden from screen
 * readers unless it is named. Icons inherit colour and size from the text
 * around them, so hover, active and danger colours reach them; a glyph or
 * an emoji would not (docs/ui/conventions.md#assets).
 *
 * An icon passes its own drawing as children and any default it changes
 * (a filled glyph sets `fill` and `stroke`); the caller's props come last.
 */
export default function IconSvg({ size = 16, title, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size ?? undefined}
      height={size ?? undefined}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title || rest['aria-label'] ? undefined : 'true'}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}
