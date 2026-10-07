/**
 * Files allowed to define more than one component, each with its reason.
 * Everything else is one component per file (docs/conventions.md#component-files).
 *
 * Shrink-only: tests/components/markup-only.test.ts fails on an entry whose
 * file no longer defines more than one component, and on a list longer than
 * `MULTI_COMPONENT_CEILING`. Add an entry only for a set whose members are
 * one thing to a reader (an icon set, a renderer's component map), never to
 * keep a row or a cell beside its list.
 */

const ICON_SET = 'an icon set: stateless SVG glyphs drawn on the same grid, read and edited side by side';

export const MULTI_COMPONENT: Readonly<Record<string, string>> = {
  'src/components/ui/icons/icons.tsx': ICON_SET,
  'src/components/voice/common/icons.tsx': ICON_SET,
  'src/components/chat/forum/forum-icons.tsx': ICON_SET,
  'src/components/chat/composer/composer-icons.tsx': ICON_SET,
  'src/components/chat/pq/pq-shield-icons.tsx': ICON_SET,
  'src/components/social/feed/icons.tsx': ICON_SET,
  'src/app/[locale]/app/login/login-icons.tsx': ICON_SET,
  'src/components/guides/mdx/mdx-components.tsx':
    'the MDX component map: one styled element per Markdown tag, handed to the MDX renderer as one object',
  'src/app/[locale]/media-kit/kit/banners.tsx':
    'the media-kit banner variants: the same artwork at each social network size, drawn from one shared layout',
  'src/app/[locale]/app/mounts/lazy-mounts.tsx':
    'the shell\'s lazy boundaries in one place, so tests/app/[locale]/app/mounts/lazy-mounts.test.tsx can see every heavy import stays out of the first download',
  'src/components/games/table/LazyTables.tsx':
    'the game tables\' lazy boundaries, one per board, each a Suspense wrapper around a lazy import',
  'src/components/ui/overlays/menu.tsx':
    'the menu primitive\'s parts (item, link, divider), which share one private row style and are always used together',
};

/** Lower this when an entry leaves `MULTI_COMPONENT`; never raise it. */
export const MULTI_COMPONENT_CEILING = 12;
