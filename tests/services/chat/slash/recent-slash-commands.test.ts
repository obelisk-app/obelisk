import { beforeEach, describe, expect, it } from 'vitest';
import { loadRecentSlashCommands, pushRecentSlashCommand } from '@/services/chat/slash/recent-slash-commands';

describe('recent slash commands', () => {
  beforeEach(() => localStorage.clear());

  it('keeps most-recent first without duplicates', () => {
    pushRecentSlashCommand('a');
    pushRecentSlashCommand('b');
    expect(pushRecentSlashCommand('a')).toEqual(['a', 'b']);
    expect(loadRecentSlashCommands()).toEqual(['a', 'b']);
  });

  it('caps the list', () => {
    for (let i = 0; i < 20; i++) pushRecentSlashCommand(String(i));
    expect(loadRecentSlashCommands()).toHaveLength(8);
    expect(loadRecentSlashCommands()[0]).toBe('19');
  });
});
