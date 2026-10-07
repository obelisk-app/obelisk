import { cn } from '@/utils/style/cn';

export type TableAlign = 'left' | 'center' | 'right';
/** Horizontal cell padding; `md` is the wider first column that holds a checkbox. */
export type TableInset = 'sm' | 'md';

const ALIGN_CLASS: Record<TableAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

const INSET_CLASS: Record<TableInset, string> = {
  sm: 'px-2 py-2',
  md: 'px-3 py-2',
};

/** The classes of a Table column's header and body cells: its inset, its alignment, then its own. */
export function tableCellClass(col: { inset?: TableInset; align?: TableAlign; className?: string }): string {
  return cn(INSET_CLASS[col.inset ?? 'sm'], col.align && ALIGN_CLASS[col.align], col.className);
}
