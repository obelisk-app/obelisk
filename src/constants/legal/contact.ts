/**
 * Legal: contact. Where a person reaches the project, as the legal pages
 * (`/privacy`, `/terms`, `/support`) print and link it. The addresses are the
 * ones `ABUSE.md` and `SECURITY.md` publish; change them there too.
 */

import type { LegalLink } from '@/types/legal/document';

/** Support, privacy and abuse: one inbox (`ABUSE.md`). */
export const LEGAL_EMAIL = 'abuse@obelisk.ar';

/** Security reports (`SECURITY.md`). */
export const SECURITY_EMAIL = 'security@obelisk.ar';

/** The arguments the `legal.*` messages take: `{email}` and `{security}`. */
export const LEGAL_VALUES = { email: LEGAL_EMAIL, security: SECURITY_EMAIL } as const;

const REPO = 'https://github.com/obelisk-app/obelisk';

export const LEGAL_LINKS = {
  email: { href: `mailto:${LEGAL_EMAIL}`, label: 'legal.links.email' },
  security: { href: `mailto:${SECURITY_EMAIL}`, label: 'legal.links.security' },
  issues: { href: `${REPO}/issues`, label: 'legal.links.issues' },
  license: { href: `${REPO}/blob/main/LICENSE`, label: 'legal.links.license' },
  abusePolicy: { href: `${REPO}/blob/main/ABUSE.md`, label: 'legal.links.abusePolicy' },
  securityPolicy: { href: `${REPO}/blob/main/SECURITY.md`, label: 'legal.links.securityPolicy' },
  privacy: { href: '/privacy', label: 'legal.links.privacy' },
  terms: { href: '/terms', label: 'legal.links.terms' },
  support: { href: '/support', label: 'legal.links.support' },
  help: { href: '/help', label: 'legal.links.help' },
  localData: { href: '/help/local-data', label: 'legal.links.localData' },
} as const satisfies Record<string, LegalLink>;
