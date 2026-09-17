import { describe, it, expect } from 'vitest';
import { CHANNEL_KIND_LABEL } from './PhoneShell';

describe('CHANNEL_KIND_LABEL', () => {
  it('calls a forum-kind channel "Publications"', () => {
    // Regression: the mobile picker derived its label from the kind id
    // (`k.charAt(0).toUpperCase() + k.slice(1)`), so it printed "Forum"
    // straight off the wire value and no copy edit could reach it.
    expect(CHANNEL_KIND_LABEL.forum).toBe('Publications');
  });

  it('names every channel kind', () => {
    expect(CHANNEL_KIND_LABEL).toEqual({
      text: 'Text',
      voice: 'Voice',
      'voice-sfu': 'Voice (SFU)',
      forum: 'Publications',
    });
  });

  it('never leaks the wire value into a label', () => {
    for (const label of Object.values(CHANNEL_KIND_LABEL)) {
      expect(label.toLowerCase()).not.toContain('forum');
    }
  });
});
