/**
 * Draws the static pages' preview cards (the site pages, the app, the voice
 * tool and every guide, in every language) into public/og/cards/, and their
 * versions (src/constants/seo/og-card-versions.json): the `?v=` in each
 * card's URL, which a test checks against today's copy and design.
 * The pages drawn from live data (notes, profiles, hashtags, relay share
 * links) have no file: the route src/app/[locale]/og/[kind]/[id] draws them
 * on request.
 *
 * Run after changing a page's seo copy, a guide's title, search description
 * or tags, or the card design:  npm run snap-og
 */
import { snapStaticCards } from '@/services/server/og/snap';
import { translatorFor } from '../i18n/messages';

async function main() {
  console.log('Drawing the static preview cards -> public/og/cards');
  const manifest = await snapStaticCards(translatorFor, process.cwd(), (line) => console.log(line));
  console.log(`\n${Object.keys(manifest).length} cards. Done.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
