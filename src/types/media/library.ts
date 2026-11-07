import type { JsMediaItem, JsMediaKind, JsMediaPack } from '@/services/nostr-bridge';

export type LibraryTab = 'discover' | 'mine' | 'favorites' | 'server';
export type MediaFilter = 'all' | JsMediaKind;
export type EditablePack = Pick<JsMediaPack, 'identifier' | 'title' | 'description' | 'image' | 'items'> & { baseCreatedAt?: number; owner?: string; serverRelay?: string; mergeReview?: { added: number; duplicates: string[]; renamed: string[] } };
export type SelectedMedia = { pack?: JsMediaPack; item: JsMediaItem };

export type MediaTransfer = { destination?: EditablePack; items: readonly JsMediaItem[]; addresses: readonly string[] };
