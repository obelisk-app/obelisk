import type { JsMediaItem, JsMediaKind, JsMediaPack } from '@/services/nostr-bridge';

export type LibraryTab = 'discover' | 'mine' | 'favorites' | 'server';
export type MediaFilter = 'all' | JsMediaKind;
export type EditablePack = Pick<JsMediaPack, 'identifier' | 'title' | 'description' | 'image' | 'items'>;
export type SelectedMedia = { pack?: JsMediaPack; item: JsMediaItem };
