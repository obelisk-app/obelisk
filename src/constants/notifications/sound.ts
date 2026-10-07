/**
 * Notifications: sound. Values the code in `services/notifications/sound.ts`
 * reads, kept here so every reader imports the one copy.
 */

/** Minimum gap between two chimes. Anything inside it is dropped. */
export const SOUND_MIN_GAP_MS = 1200;

/** How long a suspended context gets to resume before the chime is dropped. */
export const RESUME_DEADLINE_MS = 400;
