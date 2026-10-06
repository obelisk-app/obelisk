import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/utils/style/cn';
import EmptyState, { type EmptyStatePadding } from './EmptyState';
import ErrorState from './ErrorState';
import Spinner from './Spinner';

export type TableAlign = 'left' | 'center' | 'right';
/** Horizontal cell padding; `md` is the wider first column that holds a checkbox. */
export type TableInset = 'sm' | 'md';
/** `sticky` pins the header to the scroll container with the panel's blurred backdrop. */
export type TableHeader = 'static' | 'sticky';
/** `row` keeps the header and shows the empty copy in a full-width cell; `replace` shows only the copy. */
export type TableEmptyPlacement = 'row' | 'replace';

export interface TableColumn<Row> {
  /** Stable id for the `<th>` key; not shown. */
  key: string;
  header: ReactNode;
  cell: (row: Row, index: number) => ReactNode;
  align?: TableAlign;
  inset?: TableInset;
  /** Classes on both the header and body cells (widths, truncation). */
  className?: string;
}

export interface TableProps<Row> {
  columns: ReadonlyArray<TableColumn<Row>>;
  rows: ReadonlyArray<Row>;
  rowKey: (row: Row, index: number) => string;
  /** The accessible name; a screen reader announces it on entering the table. */
  'aria-label': string;
  header?: TableHeader;
  loading?: boolean;
  loadingLabel?: string;
  /** Copy for when there are no rows and nothing is loading. */
  empty?: ReactNode;
  emptyPlacement?: TableEmptyPlacement;
  emptyPadding?: EmptyStatePadding;
  emptyClassName?: string;
  /**
   * Why the rows could not be loaded. Shown in a full-width row, announced,
   * in place of the rows, the empty copy and the loading row.
   */
  error?: ReactNode;
  rowClassName?: (row: Row, index: number) => string | undefined;
  className?: string;
}

const ALIGN_CLASS: Record<TableAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

const INSET_CLASS: Record<TableInset, string> = {
  sm: 'px-2 py-2',
  md: 'px-3 py-2',
};

const HEADER_CLASS: Record<TableHeader, string | undefined> = {
  static: undefined,
  sticky: 'sticky top-0 bg-lc-dark/95 backdrop-blur',
};

function cellClass<Row>(col: TableColumn<Row>): string {
  return cn(INSET_CLASS[col.inset ?? 'sm'], col.align && ALIGN_CLASS[col.align], col.className);
}

/**
 * Tabular data: a real `<table>` with `<th scope="col">`, an accessible
 * name, sticky header, empty and loading rows. Columns are declared, not
 * composed from children, because every table in this app maps an array of
 * records, and a column object keeps a header, its cell and its alignment
 * together while letting the primitive own the `colSpan` of the empty and
 * loading rows.
 */
export default function Table<Row>({
  columns,
  rows,
  rowKey,
  'aria-label': ariaLabel,
  header = 'static',
  loading = false,
  loadingLabel,
  empty,
  emptyPlacement = 'row',
  emptyPadding = 'md',
  emptyClassName,
  error,
  rowClassName,
  className,
}: TableProps<Row>) {
  const t = useTranslations();
  const failed = error !== undefined && error !== null && error !== false;
  const isEmpty = !failed && !loading && rows.length === 0;
  if (isEmpty && emptyPlacement === 'replace') {
    return <EmptyState padding={emptyPadding} className={emptyClassName}>{empty}</EmptyState>;
  }
  return (
    <table className={cn('w-full text-sm', className)} aria-label={ariaLabel} aria-busy={(loading && !failed) || undefined}>
      <thead className={HEADER_CLASS[header]}>
        <tr className="text-left text-xs uppercase text-lc-muted">
          {columns.map((col) => (
            <th key={col.key} scope="col" className={cellClass(col)}>{col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {failed && (
          <tr>
            <td colSpan={columns.length} className="px-3 py-4">
              <ErrorState variant="box">{error}</ErrorState>
            </td>
          </tr>
        )}
        {!failed && loading && (
          <tr>
            <td colSpan={columns.length} className="px-3 py-6 text-center">
              <Spinner label={loadingLabel ?? t('common.loading')} />
            </td>
          </tr>
        )}
        {isEmpty && (
          <tr>
            <td colSpan={columns.length}>
              <EmptyState padding={emptyPadding} className={emptyClassName}>{empty}</EmptyState>
            </td>
          </tr>
        )}
        {!failed && !loading && rows.map((row, index) => (
          <tr key={rowKey(row, index)} className={cn('border-t border-lc-border/40 hover:bg-lc-card', rowClassName?.(row, index))}>
            {columns.map((col) => (
              <td key={col.key} className={cellClass(col)}>{col.cell(row, index)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
