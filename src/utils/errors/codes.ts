/**
 * The codes an error or a status line carries on its way to a reader.
 *
 * The bridge, the relay hub and the DM call layer throw (or log) a code and
 * keep their English text as the `Error`'s message, for logs and
 * developers. The UI turns the code into the reader's language with
 * `errorText` (`./error-text.ts`) or, for the activity indicators,
 * `activityTitle` / `activityDetail` (`./activity-text.ts`). Each code is a
 * key in `src/i18n/messages/<locale>/errors.json`; the type checks below fail
 * the build when the lists and the English messages drift apart, and
 * `tests/i18n/locales.test.ts` keeps es and pt in step with English.
 *
 * No i18n runtime here, and no app imports: `src/services` and the bridge
 * import this file freely.
 */
import type en from '@/i18n/messages/en/errors.json';

type Messages = typeof en;

/** One per message under `codes` in errors.json. */
export const ERROR_CODES = [
  'not-logged-in', 'not-ready', 'offline', 'no-relays-connected',
  'extension-missing', 'extension-no-nip04', 'extension-no-nip44', 'signer-no-nip44',
  'signer-unsupported', 'pq-unavailable', 'signer-timeout', 'signer-reset',
  'publish-rejected', 'publish-timeout', 'auth-refused', 'not-whitelisted', 'relay-error',
  'invalid-relay-url', 'dms-off', 'files-need-nip17', 'search-timeout', 'own-packs-only',
  'profile-load-failed', 'profile-lookup-timeout', 'mute-list-load-failed',
  'invalid-bunker-url', 'bunker-missing-secret', 'bunker-no-session', 'nostrconnect-cancelled',
  'call-relay-failed',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** What an activity-log entry from the bridge carries as its `label`; one per group under `activity` in errors.json. */
export const ACTIVITY_CODES = [
  'signExtension', 'signBunker', 'signLocal', 'publish', 'connect', 'reconnect', 'relayAuth',
  'bunkerConnect', 'bunkerScan',
] as const;

export type ActivityCode = (typeof ACTIVITY_CODES)[number];

/** What an activity-log entry carries as its `description`: the event kind, named. One per key under `kinds` in errors.json but `number`. */
export const EVENT_KIND_LABELS = [
  'relayAuth', 'message', 'dm', 'groupMetadata', 'groupAdmins', 'groupMembers', 'reaction',
  'appData', 'relayList', 'event',
] as const;

export type EventKindLabel = (typeof EVENT_KIND_LABELS)[number];

/** `true` only when the two key sets are the same; anything else fails to compile below. */
type SameKeys<A extends PropertyKey, B extends PropertyKey> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const codesMatch: SameKeys<ErrorCode, keyof Messages['codes']> = true;
const activityMatch: SameKeys<ActivityCode, keyof Messages['activity']> = true;
const kindsMatch: SameKeys<EventKindLabel, Exclude<keyof Messages['kinds'], 'number'>> = true;
void codesMatch;
void activityMatch;
void kindsMatch;

const ERROR_CODE_SET: ReadonlySet<string> = new Set(ERROR_CODES);
const ACTIVITY_CODE_SET: ReadonlySet<string> = new Set(ACTIVITY_CODES);
const EVENT_KIND_LABEL_SET: ReadonlySet<string> = new Set(EVENT_KIND_LABELS);

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && ERROR_CODE_SET.has(value);
}

export function isActivityCode(value: unknown): value is ActivityCode {
  return typeof value === 'string' && ACTIVITY_CODE_SET.has(value);
}

export function isEventKindLabel(value: unknown): value is EventKindLabel {
  return typeof value === 'string' && EVENT_KIND_LABEL_SET.has(value);
}

/**
 * An error a reader may see. `message` stays English, for the console and
 * bug reports; `code` is what the UI translates.
 */
export class CodedError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'CodedError';
    this.code = code;
  }
}

/**
 * The code an error carries, or null. Reads any object's string `code`
 * (a `CodedError`, or a `src/lib` error that names one of ours), and a bare
 * code string (an activity entry's failure detail, a connection-state
 * suffix). Unknown codes, numeric DOM codes and plain messages give null.
 */
export function errorCodeOf(err: unknown): ErrorCode | null {
  if (isErrorCode(err)) return err;
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (isErrorCode(code)) return code;
  }
  return null;
}

/**
 * What an activity-log entry keeps as its failure detail: the code when
 * the error has one (the indicator translates it), else the error's own
 * words (a relay's or a signer's, shown as they came).
 */
export function codeOrMessage(err: unknown): string {
  return errorCodeOf(err) ?? (err instanceof Error ? err.message : String(err));
}
