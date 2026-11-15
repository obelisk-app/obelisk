/** Community identity is independent of the selected channel. */
export type CommunityRef =
  | { readonly protocol: 'nip29'; readonly relay: string }
  | { readonly protocol: 'concord'; readonly communityId: string };

export interface CommunityChannelRef {
  readonly community: CommunityRef;
  readonly channelId: string;
}
