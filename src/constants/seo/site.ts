/**
 * SEO: site. Values the code in `utils/seo/site.ts` reads, kept here so every
 * reader imports the one copy.
 */

/**
 * PWA route guard: an installed app opened on the landing page (`/`,
 * `/es`, `/pt`) jumps straight to the chat shell in the same language, so
 * the marketing hero does not flash before the shell mounts.
 */
export const PWA_ROUTE_GUARD = `(function(){try{var s=(typeof matchMedia==='function'&&matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true;var m=location.pathname.match(/^\\/(es|pt)?\\/?$/);if(s&&m){location.replace((m[1]?'/'+m[1]:'')+'/app'+location.search+location.hash);}}catch(e){}})();`;
