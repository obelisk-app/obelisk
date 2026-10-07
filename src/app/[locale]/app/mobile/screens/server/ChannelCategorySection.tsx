'use client';

import type { ReactNode } from 'react';

/** A collapsible category in the server list: its label button with a caret, then its rows. */
export function ChannelCategorySection({
  catId,
  label,
  collapsed,
  onToggle,
  showHeader = true,
  children,
}: {
  catId: string;
  label: ReactNode;
  collapsed: boolean;
  onToggle: () => void;
  showHeader?: boolean;
  children: ReactNode;
}) {
  return (
    <div data-cat-id={catId}>
      {showHeader && (
        <button className="channel-section-label collapsible" onClick={onToggle}>
          <span>{label}</span>
          <span className={`cat-caret ${collapsed ? '' : 'expanded'}`} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 6 15 12 9 18" /></svg>
          </span>
        </button>
      )}
      {!collapsed && children}
    </div>
  );
}
