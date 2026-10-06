/**
 * The NIP-29 membership commands a user or an admin sends: join and leave
 * requests, put-user (with roles), remove-user and remove-permission. Each
 * is one signed event on the active relay; the relay's next 39001 / 39002
 * is what changes the lists. Pure move from `groups/membership.ts`.
 */
import {
  KIND_GROUP_JOIN_REQUEST,
  KIND_GROUP_LEAVE_REQUEST,
  KIND_GROUP_PUT_USER,
  KIND_GROUP_REMOVE_PERMISSION,
  KIND_GROUP_REMOVE_USER,
} from '@/utils/nip-kinds';
import type { BridgeContext } from '../context';

export class MembershipCommands {
  constructor(private readonly ctx: Pick<BridgeContext, 'signAndPublish'>) {}

  async joinGroup(groupId: string): Promise<void> {
    await this.ctx.signAndPublish({
      kind: KIND_GROUP_JOIN_REQUEST,
      content: '',
      tags: [['h', groupId]],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async leaveGroup(groupId: string): Promise<void> {
    await this.ctx.signAndPublish({
      kind: KIND_GROUP_LEAVE_REQUEST,
      content: '',
      tags: [['h', groupId]],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async putUser(
    groupId: string,
    pubkey: string,
    roles?: ReadonlyArray<string>,
    opts?: { quiet?: boolean },
  ): Promise<void> {
    const pTag: string[] = ['p', pubkey];
    if (roles && roles.length > 0) pTag.push(...roles);
    await this.ctx.signAndPublish(
      {
        kind: KIND_GROUP_PUT_USER,
        content: '',
        tags: [['h', groupId], pTag],
        created_at: Math.floor(Date.now() / 1000),
      },
      [],
      opts,
    );
  }

  async removeUser(groupId: string, pubkey: string): Promise<void> {
    await this.ctx.signAndPublish({
      kind: KIND_GROUP_REMOVE_USER,
      content: '',
      tags: [['h', groupId], ['p', pubkey]],
      created_at: Math.floor(Date.now() / 1000),
    });
  }

  async removePermission(
    groupId: string,
    pubkey: string,
    permissions: ReadonlyArray<string>,
  ): Promise<void> {
    if (permissions.length === 0) return;
    const pTag: string[] = ['p', pubkey, ...permissions];
    await this.ctx.signAndPublish({
      kind: KIND_GROUP_REMOVE_PERMISSION,
      content: '',
      tags: [['h', groupId], pTag],
      created_at: Math.floor(Date.now() / 1000),
    });
  }
}
