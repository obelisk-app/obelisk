/**
 * The channel commands: create (kind 9007, then the kind 9002 that names
 * it) and edit metadata (kind 9002). Split from `./metadata.ts` (round 16)
 * so that file holds the store and its ingest.
 */
import { KIND_GROUP_CREATE, KIND_GROUP_EDIT_METADATA } from '@/utils/nostr/nip-kinds';
import { generateGroupId } from '../../common/hex';
import type { BridgeContext } from '../../facade/context';
import { editMetadataTags, type CreateGroupOptions, type EditGroupMetadataOptions } from './metadata-tags';

export type MetadataCommandsContext = Pick<BridgeContext, 'session' | 'signAndPublish'>;

export async function editGroupMetadata(ctx: MetadataCommandsContext, opts: EditGroupMetadataOptions): Promise<void> {
  await ctx.signAndPublish({
    kind: KIND_GROUP_EDIT_METADATA,
    content: '',
    tags: editMetadataTags(opts),
    created_at: Math.floor(Date.now() / 1000),
  });
}

/** Create the channel, record us as its creator, then name it; resolves to the new id. */
export async function createGroup(
  ctx: MetadataCommandsContext,
  recordCreator: (groupId: string, pubkey: string) => void,
  opts: CreateGroupOptions,
): Promise<string> {
  const groupId = opts.groupId ?? generateGroupId();
  await ctx.signAndPublish({
    kind: KIND_GROUP_CREATE,
    content: '',
    tags: [['h', groupId]],
    created_at: Math.floor(Date.now() / 1000),
  });
  // Optimistically record the creator locally so claimCreatorAdmin works
  // without waiting for the relay to round-trip our own kind 9007 back. The
  // explicit creator-admin claim used to live here as an unconditional
  // putUser; that fired a kind 9000 even on relays that already auto-promoted
  // the creator, polluting the moderation log. The claim is now lazy:
  // ManageGroup / settings-open paths call `claimCreatorAdmin` only if 39001
  // doesn't already include the local user.
  const session = ctx.session();
  if (session) recordCreator(groupId, session.pubKeyHex);
  await editGroupMetadata(ctx, { ...opts, groupId });
  return groupId;
}
