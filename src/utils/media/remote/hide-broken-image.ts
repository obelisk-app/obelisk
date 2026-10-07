import type { SyntheticEvent } from 'react';

/** An `<img>` `onError` that hides the broken picture, so the box behind it (an initial, a tile colour) shows instead. */
export function hideBrokenImage(e: SyntheticEvent<HTMLImageElement>): void {
  e.currentTarget.style.display = 'none';
}
