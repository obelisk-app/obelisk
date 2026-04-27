-- The Zap audit-log table is dropped: it was a server-trusted log that
-- could be spoofed by any authenticated user. Replaced by client-side
-- NIP-57 zap-receipt subscription (kind 9735) which derives proof of
-- payment from the recipient's LNURL provider's signature.

DROP TABLE IF EXISTS "Zap";
