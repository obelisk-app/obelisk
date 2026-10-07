const ROW = 'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors disabled:cursor-default disabled:opacity-45 disabled:hover:bg-transparent';

/** A menu row's classes (`ui/overlays/menu.tsx`): white on a green hover, or red on a red hover for a destructive row. */
export function menuRowClass(danger?: boolean): string {
  return `${ROW} ${danger ? 'text-red-400 hover:bg-red-500/15' : 'text-lc-white hover:bg-lc-green/15'}`;
}
