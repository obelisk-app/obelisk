import { describe, expect, it } from 'vitest';
import { isCrawler } from '@/utils/seo/crawler';

describe('isCrawler', () => {
  it('knows the link-preview bots and search crawlers', () => {
    for (const ua of ['facebookexternalhit/1.1', 'LinkedInBot/1.0', 'Twitterbot/1.0', 'WhatsApp/2', 'Googlebot/2.1', 'bingbot/2.0', 'Slackbot-LinkExpanding 1.0', 'TelegramBot (like TwitterBot)', 'Discordbot/2.0']) {
      expect(isCrawler(ua), ua).toBe(true);
    }
  });

  it('leaves browsers alone', () => {
    expect(isCrawler('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15')).toBe(false);
    expect(isCrawler(null)).toBe(false);
  });
});
