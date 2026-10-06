import type { ReactElement } from 'react';
import { render as rtlRender, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Table, { type TableColumn } from '@/components/ui/Table';
import { LocaleProvider } from '@tests/support/intl';

const render = (ui: ReactElement) => rtlRender(ui, { wrapper: LocaleProvider });

interface Person { id: string; name: string; sats: number }

const columns: ReadonlyArray<TableColumn<Person>> = [
  { key: 'name', header: 'Name', cell: (p) => p.name, inset: 'md', className: 'w-40' },
  { key: 'sats', header: 'Sats', cell: (p) => p.sats.toLocaleString('en-US'), align: 'right' },
];
const rows: Person[] = [
  { id: 'a', name: 'Alice', sats: 2100 },
  { id: 'b', name: 'Bob', sats: 42 },
];
const rowKey = (p: Person) => p.id;

describe('Table', () => {
  it('is a named <table> with scoped column headers and one row per record', () => {
    render(<Table columns={columns} rows={rows} rowKey={rowKey} aria-label="Balances" />);
    const table = screen.getByRole('table', { name: 'Balances' });
    const headers = within(table).getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual(['Name', 'Sats']);
    headers.forEach((h) => expect(h).toHaveAttribute('scope', 'col'));
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByRole('cell', { name: '2,100' })).toBeInTheDocument();
  });

  it('applies alignment, inset and column classes to both header and body cells', () => {
    render(<Table columns={columns} rows={rows} rowKey={rowKey} aria-label="t" />);
    const [nameHeader, satsHeader] = screen.getAllByRole('columnheader');
    expect(nameHeader).toHaveClass('px-3', 'py-2', 'w-40');
    expect(satsHeader).toHaveClass('px-2', 'py-2', 'text-right');
    expect(screen.getByRole('cell', { name: 'Alice' })).toHaveClass('px-3', 'w-40');
    expect(screen.getByRole('cell', { name: '42' })).toHaveClass('text-right');
  });

  it('sticky header gets the blurred panel backdrop; static does not', () => {
    const { rerender } = render(<Table columns={columns} rows={rows} rowKey={rowKey} aria-label="t" header="sticky" />);
    expect(screen.getByRole('table').querySelector('thead')).toHaveClass('sticky', 'top-0', 'backdrop-blur');
    rerender(<Table columns={columns} rows={rows} rowKey={rowKey} aria-label="t" />);
    expect(screen.getByRole('table').querySelector('thead')).not.toHaveClass('sticky');
  });

  it('rows carry the hover row style plus any per-row class', () => {
    render(<Table columns={columns} rows={rows} rowKey={rowKey} aria-label="t" rowClassName={(p) => (p.sats > 100 ? 'is-rich' : undefined)} />);
    const [, alice, bob] = screen.getAllByRole('row');
    expect(alice).toHaveClass('border-t', 'hover:bg-lc-card', 'is-rich');
    expect(bob).not.toHaveClass('is-rich');
  });

  it('empty rows show the copy in a full-width cell under the header by default', () => {
    render(<Table columns={columns} rows={[]} rowKey={rowKey} aria-label="t" empty="Nothing yet" />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    const cell = screen.getByRole('cell', { name: 'Nothing yet' });
    expect(cell).toHaveAttribute('colspan', '2');
    expect(screen.getByText('Nothing yet')).toHaveClass('text-lc-muted', 'text-center', 'py-6');
  });

  it('emptyPadding reaches the EmptyState in both placements', () => {
    const { rerender } = render(<Table columns={columns} rows={[]} rowKey={rowKey} aria-label="t" empty="E" emptyPadding="none" emptyClassName="py-8" />);
    expect(screen.getByText('E')).toHaveClass('py-8');
    expect(screen.getByText('E')).not.toHaveClass('py-6');
    rerender(<Table columns={columns} rows={[]} rowKey={rowKey} aria-label="t" empty="E" emptyPadding="none" emptyPlacement="replace" />);
    expect(screen.getByText('E')).not.toHaveClass('py-10');
  });

  it('emptyPlacement replace renders only the empty state', () => {
    render(<Table columns={columns} rows={[]} rowKey={rowKey} aria-label="t" empty="Nothing yet" emptyPlacement="replace" emptyClassName="px-5" />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Nothing yet')).toHaveClass('text-lc-muted', 'px-5');
  });

  it('loading shows a spinner row, marks the table busy and hides rows and empty copy', () => {
    render(<Table columns={columns} rows={rows} rowKey={rowKey} aria-label="t" loading loadingLabel="Loading members" empty="Nothing" />);
    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status', { name: 'Loading members' })).toBeInTheDocument();
    expect(screen.queryByText('Alice')).toBeNull();
    expect(screen.queryByText('Nothing')).toBeNull();
    expect(within(table).getAllByRole('row')).toHaveLength(2);
  });

  it('names the spinner in the reader\'s language when the caller gives no label', () => {
    rtlRender(<Table columns={columns} rows={rows} rowKey={rowKey} aria-label="t" loading />, {
      wrapper: ({ children }) => <LocaleProvider initialLocale="es">{children}</LocaleProvider>,
    });
    expect(screen.getByRole('status', { name: 'Cargando…' })).toBeInTheDocument();
  });
});

describe('Table error', () => {
  it('shows the error in an announced full-width row instead of the rows', () => {
    render(<Table columns={columns} rows={rows} rowKey={rowKey} aria-label="t" error="Relay refused the list" />);
    const table = screen.getByRole('table');
    const alert = within(table).getByRole('alert');
    expect(alert).toHaveTextContent('Relay refused the list');
    expect(alert.closest('td')).toHaveAttribute('colspan', '2');
    expect(screen.queryByText('Alice')).toBeNull();
  });

  it('wins over loading and empty, and the table is not busy', () => {
    render(<Table columns={columns} rows={[]} rowKey={rowKey} aria-label="t" loading empty="Nothing" error="Failed" />);
    expect(screen.getByRole('table')).not.toHaveAttribute('aria-busy');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Nothing')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('Failed');
  });
});
