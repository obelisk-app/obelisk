import type { SyntheticEvent } from 'react';

/** An image `onError`: hide the image rather than show the browser's broken-image box. */
export function hideBrokenImage(e: SyntheticEvent<HTMLImageElement>): void {
  (e.target as HTMLImageElement).style.display = 'none';
}
