/**
 * Locale-aware `Link`, `redirect`, `useRouter`, `usePathname` and
 * `getPathname`. Every internal link goes through these, so `/app` written
 * in a Spanish page lands on `/es/app`. ESLint bans the `next/link` and
 * `next/navigation` equivalents outside `src/i18n/`.
 */

import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

export const { Link, redirect, permanentRedirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
