import { FULLSCREEN_BELOW_PX } from '@/constants/games/table';

/**
 * Whether a table opens fullscreen. Phones get it by default: a 20-row well
 * plus rails does not fit in a dialog on a handset, and the board was being
 * cut off top and bottom. On the server there is no window, so no.
 */
export function opensFullscreen(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < FULLSCREEN_BELOW_PX;
}
