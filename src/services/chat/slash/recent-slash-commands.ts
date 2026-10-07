// Most-recently-used slash commands, like recent-emojis does for reactions.
// Stores command ids (see slashCommandId), MRU-ordered, capped at MAX.
import { createLocalStore } from '@/services/common/local-store';

const MAX = 8;
const store = createLocalStore<string[]>('obelisk:recent-slash-commands', []);

export function loadRecentSlashCommands(): string[] {
  const raw = store.load();
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string' && !!id).slice(0, MAX) : [];
}

export function pushRecentSlashCommand(id: string): string[] {
  const next = [id, ...loadRecentSlashCommands().filter((x) => x !== id)].slice(0, MAX);
  store.save(next);
  return next;
}
