import type { CSSProperties } from 'react';

/**
 * The phone channel-settings sheet's selectable pills: accent border, tint
 * and text when picked, the quiet surface when not.
 */

/** One of the three access presets (public, read-only, private). */
export function accessPillStyle(active: boolean): CSSProperties {
  return {
    flex: 1,
    padding: '10px 12px',
    borderRadius: 12,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-line)'}`,
    background: active ? 'rgba(180, 249, 83, 0.08)' : 'var(--app-surface)',
    color: active ? 'var(--accent)' : 'var(--app-text-dim)',
    fontWeight: 600,
    fontSize: 12,
    textAlign: 'center',
    cursor: 'pointer',
  };
}

/** One of the four channel kinds, two to a row. */
export function kindPillStyle(active: boolean): CSSProperties {
  return {
    flex: '1 1 calc(50% - 6px)',
    padding: '8px 10px',
    borderRadius: 10,
    border: `1px solid ${active ? 'var(--accent)' : 'var(--app-line)'}`,
    background: active ? 'rgba(180, 249, 83, 0.08)' : 'var(--app-surface)',
    color: active ? 'var(--accent)' : 'var(--app-text-dim)',
    fontSize: 12,
    fontWeight: 600,
  };
}
