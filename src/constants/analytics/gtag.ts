/**
 * Analytics: gtag. Values the code in `services/analytics/gtag.ts` reads, kept
 * here so every reader imports the one copy.
 */

export const GA_MEASUREMENT_ID = 'G-BZ4NB66WY0';

export const GTAG_SRC = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;

/** The `<script>` element's id, so a second start does not load it twice. */
export const GTAG_SCRIPT_ID = 'gtag-js';

/** The cookies gtag.js sets: `_ga` (device id) and `_ga_<property>` (the visit). */
export const GA_COOKIE = '_ga';

export const GA_COOKIE_PREFIX = '_ga_';
