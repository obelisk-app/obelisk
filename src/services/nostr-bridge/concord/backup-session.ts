import type { BridgeImpl } from '../facade/client';
import { openConcordBackup, sealConcordBackup } from './backup';
import { openConcordStorage } from './storage';

export async function downloadConcordBackup(bridge: BridgeImpl): Promise<void> {
  const signer = bridge.getNipSigner();
  if (!signer) throw new Error('No active signer');
  const guard = bridge.captureSessionGuard();
  const storage = await openConcordStorage(signer.pubkey, guard);
  const archive = await sealConcordBackup(signer, await storage.snapshot());
  guard();
  const url = URL.createObjectURL(new Blob([archive], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `obelisk-concord-${new Date().toISOString().slice(0, 10)}.json`;
  try { link.click(); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

export async function stageConcordBackupRestore(bridge: BridgeImpl, file: File): Promise<void> {
  const signer = bridge.getNipSigner();
  if (!signer) throw new Error('No active signer');
  const guard = bridge.captureSessionGuard();
  const records = await openConcordBackup(signer, file);
  guard();
  const storage = await openConcordStorage(signer.pubkey, guard);
  await storage.stageRestore(records);
}
