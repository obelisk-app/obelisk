'use client';

/** A square icon button for the reader and feed pane headers; `children` are the SVG's paths. */
export function PaneIconButton({
  label,
  testId,
  onClick,
  children,
}: {
  label: string;
  testId: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="lc-icon-btn"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testId}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
