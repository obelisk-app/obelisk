/**
 * Where the user panel opens: beside its anchor, kept inside the window.
 */
export type PanelAnchor = { x: number; y: number; placement?: 'top' | 'bottom' };

/**
 * Where the profile popover sits: fixed bottom-left of the viewport by
 * default (Discord-style), or above/below an anchor kept 8px inside the
 * window.
 */
export function panelPositionStyle(
  anchor: PanelAnchor | undefined,
  viewport: { width: number; height: number },
): React.CSSProperties {
  return anchor
    ? {
        position: 'fixed',
        left: Math.max(8, Math.min(viewport.width - 348, anchor.x)),
        ...(anchor.placement === 'top'
          ? { bottom: viewport.height - anchor.y + 8 }
          : { top: anchor.y + 8 }),
      }
    : { position: 'fixed', left: 8, bottom: 72 };
}
