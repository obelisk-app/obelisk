/** How many faces the pre-join roster shows before "+N more". */
const PASSIVE_ROSTER_FACES = 6;

/**
 * The pre-join roster: the first faces, how many more are in the call, and
 * whether there is anything to show at all.
 */
export function usePassiveCallRoster(pubkeys: readonly string[], count: number) {
  const visible = pubkeys.slice(0, PASSIVE_ROSTER_FACES);
  return {
    empty: count <= 0 && pubkeys.length === 0,
    visible,
    hidden: Math.max(0, count - visible.length),
  };
}
