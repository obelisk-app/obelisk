import { formatElapsed } from '@/utils/format/format-elapsed';

/** `m:ss` for a whole number of recorded seconds (the shared `formatElapsed` clock). */
export function formatDuration(seconds: number): string {
  return formatElapsed(seconds * 1000);
}
