/**
 * The relay's invite minter API (obelisk-relay `/api/invites`), as the app
 * reads it. Protocol: obelisk-relay `docs/relay-invites.md` §4.
 */

/**
 * Why this account may create invite links on a relay: it owns the relay,
 * administers it, is one of its reference accounts (these three share an
 * automatic allowance), or an admin granted it one. Null: it may not.
 */
export type RelayInviteBasis = 'owner' | 'admin' | 'reference' | 'grant';

export interface RelayInviteRedemption {
  pubkey: string;
  npub: string;
  at: number;
  /** Set when the relay's operator later removed this person. */
  evicted_at?: number;
}

export type RelayInviteCodeStatus = 'active' | 'revoked' | 'expired' | 'exhausted';

export interface RelayInviteCode {
  code: string;
  label: string | null;
  status: RelayInviteCodeStatus;
  created_at: number;
  max_uses: number | null;
  uses: number;
  expires_at: number | null;
  revoked_at?: number | null;
  redemptions: RelayInviteRedemption[];
}

/** An explicit allowance an admin gave this account. */
export interface RelayInviteGrant {
  max_codes: number | null;
  max_uses_per_code: number | null;
  max_total_admits: number | null;
  max_ttl_secs: number | null;
}

/** Who let this account in, when it came in on someone's link. */
export interface RelayInviteInvitedBy {
  code: string;
  pubkey: string;
  npub: string;
  at: number;
}

/** `GET /api/invites/me`, normalized (`inviteMeFromJson`). */
export interface RelayInviteMe {
  pubkey: string;
  admitted: boolean;
  basis: RelayInviteBasis | null;
  can_mint: boolean;
  is_admin: boolean;
  /** The allowance's total (10 for the automatic one); null when there is no limit. */
  admits_total: number | null;
  admits_used: number;
  admits_left: number | null;
  codes_left: number | null;
  invited_by: RelayInviteInvitedBy | null;
  grant: RelayInviteGrant | null;
  /** Every code this account made on the relay, any status, newest first. */
  codes: RelayInviteCode[];
}

/** `POST /api/invites`: what the create form asks for. */
export interface RelayInviteCreateOptions {
  label?: string;
  maxUses?: number;
  expiresInSecs?: number;
}
