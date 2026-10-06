import type { JsMediaKind } from '@/services/nostr-bridge';
import type { PickedCustomEmoji } from './picker-types';
import type { MessageKey } from '@/i18n/keys';

export type MediaPickerTab = 'emoji' | 'gif' | 'sticker';

export const MEDIA_CATEGORIES = ['Recent', 'Trending', 'Reactions', 'Funny', 'Love', 'Celebration', 'Animals', 'Sports', 'Memes'] as const;
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

/** What the category bar calls each category; the values above double as GIPHY query ids. */
export const MEDIA_CATEGORY_LABEL: Record<MediaCategory, MessageKey> = {
  Recent: 'chat.mediaPicker.category.recent',
  Trending: 'chat.mediaPicker.category.trending',
  Reactions: 'chat.mediaPicker.category.reactions',
  Funny: 'chat.mediaPicker.category.funny',
  Love: 'chat.mediaPicker.category.love',
  Celebration: 'chat.mediaPicker.category.celebration',
  Animals: 'chat.mediaPicker.category.animals',
  Sports: 'chat.mediaPicker.category.sports',
  Memes: 'chat.mediaPicker.category.memes',
};
export type MediaEntry = PickedCustomEmoji & { categories?: readonly MediaCategory[]; kind?: JsMediaKind };
export type RecentMediaEntry = MediaEntry & { tab: Exclude<MediaPickerTab, 'emoji'> };

const giphy = (id: string) => 'https://media.giphy.com/media/' + id + '/giphy.gif';
const twemoji = (code: string) => 'https://cdn.jsdelivr.net/gh/jdecked/twemoji/assets/svg/' + code + '.svg';

/** Built-in GIFs shown before (or without) a GIPHY key. */
export const STARTER_GIFS: MediaEntry[] = [
  { name: 'applause', url: giphy('l3q2XhfQ8oCkm1Ts4'), categories: ['Reactions', 'Celebration'] },
  { name: 'mind_blown', url: giphy('26ufdipQqU2lhNA4g'), categories: ['Reactions', 'Memes'] },
  { name: 'laughing', url: giphy('10JhviFuU2gWD6'), categories: ['Funny', 'Memes'] },
  { name: 'yes', url: giphy('3o7abKhOpu0NwenH3O'), categories: ['Reactions'] },
  { name: 'celebrate', url: giphy('IwAZ6dvvvaTtdI8SD5'), categories: ['Celebration'] },
  { name: 'party', url: giphy('KzDqC8LvVC4lshCcGK'), categories: ['Celebration', 'Funny'] },
  { name: 'love', url: giphy('MDJ9IbxxvDUQM'), categories: ['Love'] },
  { name: 'facepalm', url: giphy('TJawtKM6OCKkvwCIqX'), categories: ['Reactions', 'Funny'] },
  { name: 'shrug', url: giphy('jPAdK8Nfzzwt2'), categories: ['Reactions', 'Memes'] },
  { name: 'popcorn', url: giphy('pUeXcg80cO8I8'), categories: ['Reactions', 'Memes'] },
  { name: 'thumbs_up', url: giphy('Od0QRnzwRBYmDU3eEO'), categories: ['Reactions'] },
  { name: 'happy_dance', url: giphy('artj92V8o75VPL7AeQ'), categories: ['Funny', 'Celebration'] },
  { name: 'dancing_cat', url: giphy('Qak74xcP7zKwzhIUry'), categories: ['Animals', 'Funny'] },
  { name: 'surprised_cat', url: giphy('u9vFMyx1Ix2l17Lc1n'), categories: ['Animals', 'Reactions'] },
  { name: 'basketball_hype', url: giphy('6UvClQVUrThCqeQHdX'), categories: ['Sports', 'Celebration'] },
  { name: 'soccer_celebration', url: giphy('XQs3F0TXdfy82jP4Qz'), categories: ['Sports', 'Celebration'] },
  { name: 'football_dance', url: giphy('xULW8x46jYrflDwdUI'), categories: ['Sports', 'Funny', 'Celebration'] },
  { name: 'dance_off', url: giphy('e62BYDU8YaoZz6dU2D'), categories: ['Funny', 'Celebration'] },
  { name: 'confetti_dance', url: giphy('9G5bX9nXYfmmatgn0B'), categories: ['Celebration'] },
  { name: 'sweet_hug', url: giphy('xd2aaDSJk8ovOFNvwC'), categories: ['Love', 'Animals'] },
  { name: 'subtle_wow', url: giphy('B11zhZWB5wfZtMl1D4'), categories: ['Reactions', 'Memes'] },
  { name: 'wait_what', url: giphy('JrekqK5AE0HRJIl13j'), categories: ['Reactions', 'Funny'] },
];

/** Built-in Twemoji stickers. */
export const STARTER_STICKERS: MediaEntry[] = [
  { name: 'laugh_cry', url: twemoji('1f602'), categories: ['Funny', 'Reactions'] },
  { name: 'heart', url: twemoji('2764'), categories: ['Love'] },
  { name: 'fire', url: twemoji('1f525'), categories: ['Reactions', 'Memes'] },
  { name: 'thumbs_up', url: twemoji('1f44d'), categories: ['Reactions'] },
  { name: 'party_popper', url: twemoji('1f389'), categories: ['Celebration'] },
  { name: 'cool', url: twemoji('1f60e'), categories: ['Funny', 'Memes'] },
  { name: 'rocket', url: twemoji('1f680'), categories: ['Celebration', 'Memes'] },
  { name: 'cat', url: twemoji('1f431'), categories: ['Animals'] },
  { name: 'football', url: twemoji('26bd'), categories: ['Sports'] },
  { name: 'hundred', url: twemoji('1f4af'), categories: ['Reactions', 'Memes'] },
  { name: 'eyes', url: twemoji('1f440'), categories: ['Reactions', 'Memes'] },
  { name: 'exploding_head', url: twemoji('1f92f'), categories: ['Reactions'] },
  { name: 'raised_hands', url: twemoji('1f64c'), categories: ['Celebration'] },
  { name: 'broken_heart', url: twemoji('1f494'), categories: ['Love'] },
  { name: 'clown', url: twemoji('1f921'), categories: ['Funny', 'Memes'] },
  { name: 'salute', url: twemoji('1fae1'), categories: ['Reactions'] },
  { name: 'clap', url: twemoji('1f44f'), categories: ['Reactions', 'Celebration'] },
  { name: 'party_face', url: twemoji('1f973'), categories: ['Funny', 'Celebration'] },
  { name: 'hearts_face', url: twemoji('1f970'), categories: ['Love'] },
  { name: 'heart_eyes', url: twemoji('1f60d'), categories: ['Love', 'Reactions'] },
  { name: 'loud_cry', url: twemoji('1f62d'), categories: ['Reactions', 'Memes'] },
  { name: 'angry', url: twemoji('1f621'), categories: ['Reactions'] },
  { name: 'thinking', url: twemoji('1f914'), categories: ['Reactions', 'Memes'] },
  { name: 'scream', url: twemoji('1f631'), categories: ['Reactions', 'Funny'] },
  { name: 'poop', url: twemoji('1f4a9'), categories: ['Funny', 'Memes'] },
  { name: 'dog', url: twemoji('1f436'), categories: ['Animals'] },
  { name: 'unicorn', url: twemoji('1f984'), categories: ['Animals', 'Memes'] },
  { name: 'basketball', url: twemoji('1f3c0'), categories: ['Sports'] },
  { name: 'trophy', url: twemoji('1f3c6'), categories: ['Sports', 'Celebration'] },
  { name: 'beers', url: twemoji('1f37b'), categories: ['Celebration'] },
  { name: 'diamond', url: twemoji('1f48e'), categories: ['Love', 'Memes'] },
  { name: 'sparkles', url: twemoji('2728'), categories: ['Celebration', 'Love'] },
];
