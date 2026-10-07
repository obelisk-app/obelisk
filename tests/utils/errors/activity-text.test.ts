import { describe, expect, it } from 'vitest';
import { translator } from '@tests/support/intl';
import type { ActivityEntry } from '@/services/feedback/activity-log';
import { ACTIVITY_CODES } from '@/constants/errors/codes';
import { activityDetail, activityKind, activityTitle } from '@/utils/errors/activity-text';

function entry(over: Partial<ActivityEntry>): ActivityEntry {
  return { id: 1, label: 'publish', status: 'pending', startedAt: 0, ...over };
}

describe('activity text', () => {
  it('titles a coded entry by its status', () => {
    const t = translator('es');
    expect(activityTitle(t, entry({}))).toBe('Publicando en los relays');
    expect(activityTitle(t, entry({ status: 'ok' }))).toBe('Publicado');
    expect(activityTitle(t, entry({ status: 'error' }))).toBe('No se pudo publicar');
  });

  it('reads the detail into a title that names a target', () => {
    expect(activityTitle(translator('en'), entry({ label: 'relayAuth', detail: 'relay.example' })))
      .toBe('Authenticating with relay.example');
  });

  it('names and numbers the event kind', () => {
    expect(activityKind(translator('pt'), entry({ description: 'dm', eventKind: 4 }))).toBe('Mensagem direta · kind 4');
    expect(activityKind(translator('en'), entry({}))).toBeNull();
  });

  it('explains a coded failure, else falls back to the kind, else the raw detail', () => {
    const t = translator('es');
    expect(activityDetail(t, entry({ status: 'error', detail: 'offline', eventKind: 9 }))).toBe('Estás sin conexión. Revisá tu conexión.');
    expect(activityDetail(t, entry({ status: 'error', detail: 'relay said no', eventKind: 9 }))).toBe('kind 9');
    expect(activityDetail(t, entry({ label: 'connect', detail: 'wss://a.example' }))).toBe('wss://a.example');
  });

  it('leaves an uncoded entry as it was written', () => {
    const t = translator('es');
    const legacy = entry({ label: 'Doing a thing', description: 'Some description' });
    expect(activityTitle(t, legacy)).toBe('Doing a thing');
    expect(activityDetail(t, legacy)).toBe('Some description');
  });

  it('has a title for every code in every status and language', () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      const t = translator(locale);
      for (const label of ACTIVITY_CODES) {
        for (const status of ['pending', 'ok', 'error'] as const) {
          expect(activityTitle(t, entry({ label, status, detail: 'x' }))).not.toMatch(/^errors\./);
        }
      }
    }
  });
});
