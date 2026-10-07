'use client';

/** A foldable category header in the channel tree, with its channels under it while open. */
export function CategorySection({
  name,
  collapsed,
  onToggle,
  channelCount,
  children,
}: {
  name: string;
  collapsed: boolean;
  onToggle: () => void;
  channelCount: number;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-lc-muted hover:text-lc-white"
      >
        <span className="inline-flex w-4 items-center justify-center">
          <svg
            className={`h-3 w-3 transition-transform duration-150 ${collapsed ? '' : 'rotate-90'}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </span>
        <span className="truncate">{name}</span>
        <span className="ml-auto text-[10px] font-normal opacity-60">{channelCount}</span>
      </button>
      {!collapsed && <div>{children}</div>}
    </div>
  );
}
