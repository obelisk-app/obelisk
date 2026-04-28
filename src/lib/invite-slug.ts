// Shared slug namespace for Invitation.code and InviteAlias.slug.
// Both reserve the same pool so a custom invite code can't shadow an alias
// (and vice versa). Slugs are always lowercased on write and match
// /^[a-z0-9_-]+$/ with length 2..40.

// Reserved mostly to protect routing semantics and admin-looking slugs.
// "obelisk" intentionally is NOT reserved — the canonical use case is
// obelisk.ar/invite/obelisk pointing at the showcase server.
export const RESERVED_SLUGS = new Set<string>([
  'admin',
  'admins',
  'api',
  'app',
  'www',
  'invite',
  'invites',
  'new',
  'null',
  'undefined',
  'login',
  'logout',
  'signup',
  'signin',
  'me',
  'settings',
  'moderation',
  'chat',
  'server',
  'servers',
  'help',
  'about',
  'terms',
  'privacy',
  'static',
  '_next',
]);

const SLUG_RE = /^[a-z0-9_-]+$/;
const MIN_LEN = 2;
const MAX_LEN = 40;

export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export type SlugError =
  | { ok: false; error: string }
  | { ok: true; slug: string };

// An Invitation row is "dead" when it's been revoked, expired, or fully used.
// Dead rows don't resolve at /invite/:code, so their slug is effectively free
// and can be reclaimed by a new alias (or another invite code).
export function isInvitationDead(inv: {
  revokedAt: Date | null;
  expiresAt: Date | null;
  uses: number;
  maxUses: number;
}): boolean {
  if (inv.revokedAt) return true;
  if (inv.expiresAt && inv.expiresAt < new Date()) return true;
  if (inv.uses >= inv.maxUses) return true;
  return false;
}

export function validateSlug(raw: string): SlugError {
  if (!raw || typeof raw !== 'string') {
    return { ok: false, error: 'Slug is required' };
  }
  const slug = normalizeSlug(raw);
  if (slug.length < MIN_LEN || slug.length > MAX_LEN) {
    return { ok: false, error: `Slug must be ${MIN_LEN}–${MAX_LEN} characters` };
  }
  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: 'Slug can only contain lowercase letters, numbers, hyphens, and underscores' };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: 'This slug is reserved' };
  }
  return { ok: true, slug };
}
