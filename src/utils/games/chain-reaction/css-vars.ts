import type { CSSProperties } from 'react';

// CSS custom properties aren't in React's CSSProperties, so styles that set
// one need a widened type rather than an `any` cast.
export type CSSVars = CSSProperties & Record<`--${string}`, string>;
