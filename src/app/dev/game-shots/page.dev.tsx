import { notFound } from 'next/navigation';
import Harness from './Harness';

/**
 * Screenshot harness for the game guides — `npm run snap-games` photographs
 * the real board components here, without a relay, a login, or a second
 * player.
 *
 * The `.dev.tsx` extension is what keeps it out of production: `pageExtensions`
 * in next.config.ts only accepts it while `next dev` is running, so this file
 * is not a route in a built site. The `notFound()` below is belt and braces
 * for anyone who adds the extension back.
 */
export const metadata = { robots: { index: false, follow: false } };

export default function GameShotsPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Harness />;
}
