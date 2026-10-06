/**
 * The engine's three listener lists: per-pubkey deny notices, "verdicts
 * changed" for anything that renders from them, and config transitions for
 * the bridge's re-evaluation pass. A throwing listener never reaches the
 * gating path.
 */

export type WotEngineEvent = 'verdict-deny' | 'verdicts-changed' | 'enabled-changed';
export type DenyListener = (pubkey: string) => void;
export type ChangeListener = () => void;

export class WotEvents {
  private readonly denyListeners = new Set<DenyListener>();
  private readonly changeListeners = new Set<ChangeListener>();
  private readonly enabledListeners = new Set<(enabled: boolean) => void>();

  onDeny(cb: DenyListener): () => void {
    this.denyListeners.add(cb);
    return () => this.denyListeners.delete(cb);
  }

  onChange(cb: ChangeListener): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }

  onEnabledChanged(cb: (enabled: boolean) => void): () => void {
    this.enabledListeners.add(cb);
    return () => this.enabledListeners.delete(cb);
  }

  fireDeny(pubkey: string): void {
    for (const cb of this.denyListeners) {
      try { cb(pubkey); } catch { /* listener errors must not crash gating */ }
    }
  }

  notifyChanged(): void {
    for (const cb of this.changeListeners) {
      try { cb(); } catch { /* ditto */ }
    }
  }

  fireEnabled(enabled: boolean): void {
    for (const cb of this.enabledListeners) {
      try { cb(enabled); } catch { /* ignore */ }
    }
  }
}
