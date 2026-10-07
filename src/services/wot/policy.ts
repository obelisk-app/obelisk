/**
 * The WoT gating policy's fixed parts: the configuration shape, the kinds
 * that are never gated, and the rule that turns one batch answer into a
 * verdict. Pure; the engine (`engine.ts`) applies it.
 */
export interface WotEngineConfig {
  enabled: boolean;
  maxHops: number;
  /**
   * Minimum number of disjoint trust paths required for an `allow` verdict.
   * `1` (default) reproduces pre-multipath behavior. Higher values demand
   * corroborating follows so a single rogue follower can't unilaterally
   * vouch for a spammer.
   */
  minPaths: number;
}

/** Any change that alters what a verdict means: graph depth, path threshold or the enable bit. */
export function verdictsInvalidated(prev: WotEngineConfig, next: WotEngineConfig): boolean {
  return prev.enabled !== next.enabled || prev.maxHops !== next.maxHops || prev.minPaths !== next.minPaths;
}

/** What the extension reports for one pubkey; either field may be absent. */
export interface BatchAnswer {
  distance: number | null;
  paths: number | null;
}

/**
 * Allow iff the distance is within maxHops AND (the extension didn't report
 * a path count OR the count meets the threshold). Treating `null` paths as
 * "satisfies" keeps engines that don't expose multipath compatible.
 */
export function batchVerdict(answer: BatchAnswer | undefined, cfg: WotEngineConfig): { allow: boolean; distance: number | null } {
  const distance = answer?.distance ?? null;
  const paths = answer?.paths ?? null;
  const inHops = typeof distance === 'number' && distance >= 0 && distance <= cfg.maxHops;
  const enoughPaths = paths === null ? true : paths >= cfg.minPaths;
  return inHops && enoughPaths ? { allow: true, distance } : { allow: false, distance: null };
}
