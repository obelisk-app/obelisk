/**
 * Google Analytics (gtag.js), loaded only after the person allows it.
 *
 * Nothing here runs on its own: `consent.ts` calls `startAnalytics` when
 * the stored answer is "allow" (or the person just gave it) and
 * `stopAnalytics` when it changes to "don't allow". Before an answer, and
 * after a "don't allow", the page has no gtag script, no `dataLayer` and no
 * `_ga` cookie.
 *
 * No inline script: the queue and the config call are made here, from the
 * app's own bundle, and the library is a plain `<script src>` that the CSP
 * allows by host (`https://www.googletagmanager.com` in `script-src`,
 * `src/utils/security/csp.ts`), so it needs no nonce and the nonce never has to
 * reach client code.
 *
 * Stopping without a reload: Google's documented opt-out is the window
 * property `ga-disable-<measurement id>`. The tag checks it before it sets
 * a cookie or sends anything, so once it is `true` the already-loaded
 * script goes quiet (single-page navigations included). The cookies it set
 * are expired at the same moment.
 */
import { cookieNamesOn, expireCookie } from '@/services/common/cookies';
import {
  GA_MEASUREMENT_ID,
  GTAG_SRC,
  GTAG_SCRIPT_ID,
  GA_COOKIE,
  GA_COOKIE_PREFIX,
} from '@/constants/analytics/gtag';

type GtagWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
} & Record<string, unknown>;

const DISABLE_FLAG = `ga-disable-${GA_MEASUREMENT_ID}`;

function isGaCookie(name: string): boolean {
  return name === GA_COOKIE || name.startsWith(GA_COOKIE_PREFIX);
}

/** Load gtag.js once and configure the property; lift the opt-out if it was set. */
export function startAnalytics(win: Window = window, doc: Document = document): void {
  const w = win as GtagWindow;
  w[DISABLE_FLAG] = false;
  if (doc.getElementById(GTAG_SCRIPT_ID)) return;
  w.dataLayer = w.dataLayer ?? [];
  // gtag.js reads the queue's entries as `arguments` objects, not arrays.
  w.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params -- gtag.js requires the arguments object
    w.dataLayer!.push(arguments);
  };
  w.gtag('js', new Date());
  w.gtag('config', GA_MEASUREMENT_ID);
  const script = doc.createElement('script');
  script.id = GTAG_SCRIPT_ID;
  script.async = true;
  script.src = GTAG_SRC;
  doc.head.appendChild(script);
}

/** Opt out for the rest of this page and delete the cookies Analytics set. */
export function stopAnalytics(win: Window = window, doc: Document = document): void {
  (win as GtagWindow)[DISABLE_FLAG] = true;
  removeAnalyticsCookies(doc);
}

/** Expire `_ga` and `_ga_<id>`, wherever on this domain they were set. */
export function removeAnalyticsCookies(doc: Document = document): void {
  for (const name of cookieNamesOn(doc)) if (isGaCookie(name)) expireCookie(name, doc);
}

/** Whether this page has loaded gtag.js (tests, and the settings screen's wording). */
export function analyticsLoaded(doc: Document = document): boolean {
  return doc.getElementById(GTAG_SCRIPT_ID) !== null;
}
