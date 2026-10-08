'use client';

import Button from '@/components/ui/buttons/Button';
import type { ReactNode } from 'react';
import { ChevronRightIcon } from '@/assets/icons';

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
        <Button variant="bare" className="channel-section-label collapsible" onClick={onToggle}>
          <span>{label}</span>
          <span className={`cat-caret ${collapsed ? '' : 'expanded'}`} aria-hidden="true">
            <ChevronRightIcon size={null} strokeWidth={2.5} />
          </span>
        </Button>
      )}
      {!collapsed && children}
    </div>
  );
}
