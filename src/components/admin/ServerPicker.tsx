'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export interface AdminServerOption {
  id: string;
  name: string;
  icon: string | null;
  role: 'owner' | 'admin' | 'mod';
  viaInstanceOwner: boolean;
}

interface ServerPickerProps {
  servers: AdminServerOption[];
  currentServerId: string;
  /** Show the "+ New Server" entry at the bottom of the dropdown. */
  canCreateServer?: boolean;
  /** Called when the user clicks "+ New Server". */
  onCreateServer?: () => void;
}

/**
 * Dropdown that lists every server the caller can administer. Switching to a
 * different server navigates to /admin/[id]. Sized to fit in the admin header.
 */
export default function ServerPicker({
  servers,
  currentServerId,
  canCreateServer = false,
  onCreateServer,
}: ServerPickerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = servers.find((s) => s.id === currentServerId) ?? servers[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!current) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-lc-border hover:border-lc-green/50 bg-lc-dark transition-colors"
        data-testid="server-picker-trigger"
      >
        {current.icon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={current.icon} alt="" className="w-6 h-6 rounded-full object-cover" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-lc-border flex items-center justify-center text-[10px] font-bold text-lc-muted">
            {current.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <span className="text-sm font-medium text-lc-white max-w-[200px] truncate">{current.name}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-lc-muted">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-72 rounded-xl border border-lc-border bg-lc-dark shadow-2xl shadow-black/40 z-50 overflow-hidden"
          data-testid="server-picker-menu"
        >
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-lc-muted font-semibold border-b border-lc-border">
            Switch server
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {servers.map((s) => {
              const active = s.id === currentServerId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (!active) router.push(`/admin/${s.id}`);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                    active ? 'bg-lc-green/10' : 'hover:bg-white/5'
                  }`}
                >
                  {s.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.icon} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-lc-border flex items-center justify-center text-xs font-bold text-lc-muted flex-shrink-0">
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-lc-white truncate">{s.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span
                        className={`text-[10px] uppercase font-semibold tracking-wider ${
                          s.role === 'owner'
                            ? 'text-lc-green'
                            : s.role === 'admin'
                              ? 'text-amber-400'
                              : 'text-blue-400'
                        }`}
                      >
                        {s.role}
                      </span>
                      {s.viaInstanceOwner && (
                        <span className="text-[10px] uppercase font-semibold tracking-wider text-purple-400">
                          • instance
                        </span>
                      )}
                    </div>
                  </div>
                  {active && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="text-lc-green flex-shrink-0">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {canCreateServer && (
            <div className="border-t border-lc-border">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onCreateServer?.();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-lc-green/10 transition-colors"
                data-testid="create-server-btn"
              >
                <div className="w-8 h-8 rounded-full bg-lc-green/15 border border-lc-green/30 flex items-center justify-center text-lc-green flex-shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-lc-green">New Server</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
