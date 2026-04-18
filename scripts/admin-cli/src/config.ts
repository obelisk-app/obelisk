import { homedir } from 'os';
import path from 'path';
import fs from 'fs';

export const DEFAULT_BASE_URL = process.env.OBELISK_URL ?? 'http://localhost:3000';

export const CONFIG_DIR = path.join(homedir(), '.config', 'obelisk-cli');
export const SESSION_FILE = path.join(CONFIG_DIR, 'session.json');
export const DEFAULT_KEY_FILE = path.join(CONFIG_DIR, 'admin.nsec');

export type SessionFile = {
  baseUrl: string;
  pubkey: string;
  cookie: string;
  savedAt: number;
};

export function ensureConfigDir(): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
}

export function loadSession(): SessionFile | null {
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf8');
    return JSON.parse(raw) as SessionFile;
  } catch {
    return null;
  }
}

export function saveSession(s: SessionFile): void {
  ensureConfigDir();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(s, null, 2), { mode: 0o600 });
  try { fs.chmodSync(SESSION_FILE, 0o600); } catch { /* best effort */ }
}

export function clearSession(): void {
  try { fs.unlinkSync(SESSION_FILE); } catch { /* ignore */ }
}
