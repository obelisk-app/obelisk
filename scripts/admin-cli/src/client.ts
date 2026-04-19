import { nip19 } from 'nostr-tools';
import { ctxFromSession, request } from './http';

function toHexPubkey(input: string): string {
  const v = input.trim();
  if (v.startsWith('npub1')) {
    const decoded = nip19.decode(v);
    if (decoded.type !== 'npub') throw new Error('Invalid npub');
    return decoded.data as string;
  }
  if (/^[0-9a-fA-F]{64}$/.test(v)) return v.toLowerCase();
  throw new Error(`Not a valid pubkey (expected npub1... or 64-char hex): ${input}`);
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export const Api = {
  // Raw escape hatch
  async exec(method: string, pathname: string, body?: any) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, method.toUpperCase(), pathname, body);
    return data;
  },

  // Servers
  async listServers() {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'GET', '/api/admin/servers');
    return data;
  },
  async getServer(serverId: string) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'GET', `/api/admin/server${qs({ serverId })}`);
    return data;
  },
  async editServer(serverId: string, patch: Record<string, any>) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'PATCH', `/api/admin/server${qs({ serverId })}`, patch);
    return data;
  },
  async deleteServer(serverId: string) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'DELETE', `/api/admin/server${qs({ serverId })}`);
    return data;
  },
  async setJoinMode(serverId: string, mode: 'open' | 'invite') {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'PATCH', `/api/admin/server/join-mode${qs({ serverId })}`, { joinMode: mode });
    return data;
  },

  // Categories
  async listCategories(serverId: string) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'GET', `/api/admin/categories${qs({ serverId })}`);
    return data;
  },
  async createCategory(serverId: string, payload: Record<string, any>) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'POST', `/api/admin/categories${qs({ serverId })}`, payload);
    return data;
  },
  async editCategory(id: string, patch: Record<string, any>) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'PATCH', `/api/admin/categories/${id}`, patch);
    return data;
  },
  async deleteCategory(id: string) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'DELETE', `/api/admin/categories/${id}`);
    return data;
  },

  // Channels
  async listChannels(serverId: string) {
    const ctx = ctxFromSession();
    // Channels are exposed via the regular channels endpoint scoped to the server
    const { data } = await request(ctx, 'GET', `/api/channels${qs({ serverId })}`);
    return data;
  },
  async createChannel(serverId: string, payload: Record<string, any>) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'POST', `/api/channels${qs({ serverId })}`, payload);
    return data;
  },
  async editChannel(id: string, patch: Record<string, any>) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'PATCH', `/api/admin/channels/${id}`, patch);
    return data;
  },
  async deleteChannel(id: string) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'DELETE', `/api/admin/channels/${id}`);
    return data;
  },

  // Roles
  async listRoles(serverId: string) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'GET', `/api/admin/roles${qs({ serverId })}`);
    return data;
  },
  async createRole(serverId: string, payload: Record<string, any>) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'POST', `/api/admin/roles${qs({ serverId })}`, payload);
    return data;
  },
  async editRole(roleId: string, patch: Record<string, any>) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'PATCH', `/api/admin/roles/${roleId}`, patch);
    return data;
  },
  async deleteRole(roleId: string) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'DELETE', `/api/admin/roles/${roleId}`);
    return data;
  },
  async assignRole(roleId: string, pubkey: string) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'POST', `/api/admin/roles/${roleId}/members`, { pubkey: toHexPubkey(pubkey) });
    return data;
  },
  async unassignRole(roleId: string, pubkey: string) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'DELETE', `/api/admin/roles/${roleId}/members${qs({ pubkey: toHexPubkey(pubkey) })}`);
    return data;
  },

  // Members
  async listMembers(serverId: string) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'GET', `/api/admin/members${qs({ serverId })}`);
    return data;
  },
  async setMemberRole(serverId: string, pubkey: string, role: 'admin' | 'mod' | 'member') {
    const ctx = ctxFromSession();
    const hex = toHexPubkey(pubkey);
    const { data } = await request(ctx, 'PATCH', `/api/admin/members/${hex}/role${qs({ serverId })}`, { role });
    return data;
  },
  async kick(serverId: string, pubkey: string, reason?: string) {
    const ctx = ctxFromSession();
    const hex = toHexPubkey(pubkey);
    const { data } = await request(ctx, 'POST', `/api/admin/members/${hex}/kick${qs({ serverId })}`, reason ? { reason } : {});
    return data;
  },
  async ban(serverId: string, pubkey: string, reason?: string) {
    const ctx = ctxFromSession();
    const hex = toHexPubkey(pubkey);
    const { data } = await request(ctx, 'POST', `/api/admin/members/${hex}/ban${qs({ serverId })}`, reason ? { reason } : {});
    return data;
  },
  async unban(serverId: string, pubkey: string) {
    const ctx = ctxFromSession();
    const hex = toHexPubkey(pubkey);
    const { data } = await request(ctx, 'DELETE', `/api/admin/members/${hex}/ban${qs({ serverId })}`);
    return data;
  },

  // Channel view used for sync: /api/channels returns {server, categories, channels}
  // including descriptions, permissions, and nested category membership.
  async getServerView(serverId: string) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'GET', `/api/channels${qs({ serverId })}`);
    return data as {
      server: Record<string, any>;
      categories: Array<any>;
      channels: Array<any>;
    };
  },

  // Post a message — same endpoint the web client uses.
  async postMessage(channelId: string, content: string, replyToId?: string) {
    const ctx = ctxFromSession();
    const body: Record<string, string> = { content };
    if (replyToId) body.replyToId = replyToId;
    const { data } = await request(ctx, 'POST', `/api/channels/${channelId}/messages`, body);
    return data;
  },

  // Create a forum post (top-level thread) — forum channels reject plain messages
  // without a title, so lockdown announcements must go through this endpoint.
  async postForumPost(channelId: string, title: string, content: string) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'POST', `/api/channels/${channelId}/posts`, { title, content, tags: [] });
    return data;
  },

  // Admin server settings (includes welcomeLocale, gate/quota fields, etc.)
  async getAdminServer(serverId: string) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'GET', `/api/admin/server${qs({ serverId })}`);
    return data as Record<string, any>;
  },

  // Messages
  async getMessages(channelId: string, limit = 50, cursor?: string) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'GET', `/api/channels/${channelId}/messages${qs({ limit, cursor })}`);
    return data as { messages: Array<any>; nextCursor: string | null };
  },
  async deleteMessage(serverId: string, messageId: string) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'DELETE', `/api/admin/messages/${messageId}${qs({ serverId })}`);
    return data;
  },

  // Instance
  async instanceSettingsGet() {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'GET', `/api/admin/instance/settings`);
    return data;
  },
  async instanceSettingsSet(patch: Record<string, any>) {
    const ctx = ctxFromSession();
    const { data } = await request(ctx, 'PUT', `/api/admin/instance/settings`, patch);
    return data;
  },
};

export { toHexPubkey };
