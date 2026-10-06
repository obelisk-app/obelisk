/** The picker's category sections: each groups one or more `EMOJI_CATEGORIES`. */
export const EMOJI_SECTIONS = [
  { name: 'Smileys', icon: '😀', label: 'Smileys & people', categories: ['Smileys', 'Gestures'] },
  { name: 'Nature', icon: '🐝', label: 'Animals & nature', categories: ['Animals', 'Nature'] },
  { name: 'Food', icon: '☕', label: 'Food & drink', categories: ['Food'] },
  { name: 'Sports', icon: '🏀', label: 'Sports', categories: ['Activities'] },
  { name: 'Cars', icon: '🚗', label: 'Cars & travel', categories: ['Transport'] },
  { name: 'Ideas', icon: '💡', label: 'Ideas & objects', categories: ['Objects'] },
  { name: 'Symbols', icon: '🎵', label: 'Symbols', categories: ['Symbols'] },
  { name: 'Flags', icon: '🏳️', label: 'Flags', categories: ['Flags'] },
] as const;

/** The category bar: Recent first, then every section. */
export const EMOJI_NAV = [
  { name: 'Recent', icon: '◷', label: 'Recent' },
  ...EMOJI_SECTIONS,
];
