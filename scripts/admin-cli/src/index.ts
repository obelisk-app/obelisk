#!/usr/bin/env -S node --enable-source-maps
/* Obelisk Admin CLI — headless driver for /admin. See README.md for usage. */
import { createInterface } from 'readline';
import { parseArgs, flagString, requireFlag } from './args';
import { DEFAULT_BASE_URL, DEFAULT_KEY_FILE } from './config';
import { loginWithNsec, loginWithNsecFile, loginWithBunker, logout, whoami } from './auth/login';
import { generateKeyFile } from './auth/keyfile';
import { Api } from './client';
import { ApiError } from './http';
import {
  CachedChannel, CachedMessage, ServerMemory,
  loadServerMemory, saveServerMemory, listServerMemories,
  mergeMessages, isChannelUpToDate,
} from './memory';
import { composeSuggestion, composeAlert, findServerForChannel, mentionToken } from './archon';

const HELP = `obelisk-admin — headless admin CLI

Usage: npm run admin -- <command> [...args] [--flags]

Global flags:
  --url <baseUrl>        Override base URL (default: $OBELISK_URL or http://localhost:3000)

Auth:
  login --nsec <nsec|hex>
  login --nsec-file <path>              Read nsec from a 0600 file (prefer this over --nsec)
  login --bunker <bunker://pubkey?relay=...&secret=...>
  logout
  whoami

Key generation:
  generate [--out <path>] [--force]     Write a fresh nsec to disk (default ~/.config/obelisk-cli/admin.nsec).
                                        Prints ONLY {npub, pubkeyHex, path} to stdout. The nsec never
                                        reaches stdout/stderr — safe to run from any terminal.

Servers:
  servers list
  servers sync [<serverId>]                     Cache server + channel config locally (all admin-able if omitted)
  servers memory [<serverId>]                   Print cached memory JSON (or list cached servers)
  servers scan <serverId> [--limit 50] [--force] [--channel <id>]
                                                Fetch recent messages per channel; incremental (skips channels that haven't changed since last scan unless --force)
  server get <serverId>
  server edit <serverId> --patch '{"name":"..."}'
  server delete <serverId>
  server join-mode <serverId> --mode open|invite

Categories:
  categories list <serverId>
  categories create <serverId> --payload '{"name":"General"}'
  categories edit <id> --patch '{"name":"..."}'
  categories delete <id>

Channels:
  channels list <serverId>
  channels topics <serverId> [--missing]                       Compact routing table (id, name, category, description) for the classifier — reads cached memory; run 'servers sync' first
  channels route-prep <serverId>                               One-shot classifier prep: refreshes this server + returns {topics, missing, eligibleCount, missingCount, syncedAt}. Use this at the start of every classification batch.
  channels create <serverId> --payload '{"name":"general","type":"text"}'
  channels edit <id> --patch '{"writePermission":"admin"}'
  channels delete <id>
  channels messages <channelId> [--limit 50] [--cursor <id>]   Fetch messages (does not touch memory)
  channels post <channelId> --content "..." [--reply-to <msgId>]   Post a message as the current identity
  channels suggest <channelId> --target <targetChannelId> [--reason "..."] [--reply-to <msgId>] [--author <hexPubkey>]
                                                                   Post an Archon suggestion nudging the user to a better channel

Alert:
  alert <serverId> --summary "..." [--channel <channelId>] [--link <url>]
                                                                   Post a rule-violation alert that @-mentions the server owner + all admins

Roles:
  roles list <serverId>
  roles create <serverId> --payload '{"name":"Mod","color":"#b4f953"}'
  roles edit <roleId> --patch '{"name":"..."}'
  roles delete <roleId>
  roles assign <roleId> --pubkey <npub|hex>
  roles unassign <roleId> --pubkey <npub|hex>

Members:
  members list <serverId>
  members role <serverId> <pubkey> --role admin|mod|member
  members kick <serverId> <pubkey> [--reason "..."]
  members ban <serverId> <pubkey> [--reason "..."]
  members unban <serverId> <pubkey>

Messages:
  messages delete <messageId> --serverId <serverId>

Instance:
  instance get
  instance set --patch '{"defaultServerId":"..."}'

Escape hatch (hit any endpoint):
  exec <METHOD> <path> [--body '{"x":1}']
    e.g. exec GET /api/admin/emojis?serverId=abc

Tips:
  - Prefer --bunker for real use so your nsec never touches the CLI process.
  - Owner-only actions: server delete, members role, instance set, server join-mode.
  - Session is stored at ~/.config/obelisk-cli/session.json (chmod 0600).
`;

async function promptHidden(label: string): Promise<string> {
  process.stdout.write(label);
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const stdin = process.stdin as any;
  const onData = (char: Buffer | string) => {
    const s = char.toString();
    if (s === '\n' || s === '\r' || s === '\u0004') return;
    process.stdout.write('\b \b');
  };
  stdin.on('data', onData);
  try {
    return await new Promise<string>((resolve) => rl.question('', (answer) => { rl.close(); resolve(answer); }));
  } finally {
    stdin.off('data', onData);
    process.stdout.write('\n');
  }
}

function parseJsonFlag(value: string | undefined, flagName: string): any {
  if (!value) return undefined;
  try { return JSON.parse(value); }
  catch (err: any) { throw new Error(`--${flagName} must be valid JSON: ${err.message}`); }
}

function print(data: unknown) {
  if (data === undefined) return;
  if (typeof data === 'string') console.log(data);
  else console.log(JSON.stringify(data, null, 2));
}

async function main(argv: string[]): Promise<number> {
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help' || argv[0] === 'help') {
    console.log(HELP);
    return 0;
  }

  const [group, sub, ...rest] = argv;
  const { positional, flags } = parseArgs(rest);
  const baseUrl = flagString(flags, 'url') ?? DEFAULT_BASE_URL;

  // Auth commands (don't require an existing session)
  if (group === 'login') {
    const bunker = flagString(flags, 'bunker');
    if (bunker) {
      console.error('Connecting to bunker… (approve the sign request in your signer)');
      const s = await loginWithBunker(baseUrl, bunker);
      console.log(`Logged in as ${s.pubkey} @ ${s.baseUrl}`);
      return 0;
    }

    const nsecFile = flagString(flags, 'nsec-file') ?? process.env.OBELISK_NSEC_FILE;
    if (nsecFile) {
      const s = await loginWithNsecFile(baseUrl, nsecFile);
      console.log(`Logged in as ${s.pubkey} @ ${s.baseUrl}`);
      return 0;
    }

    let nsecValue = flagString(flags, 'nsec') ?? process.env.OBELISK_NSEC;
    if (!nsecValue) nsecValue = await promptHidden('nsec (hidden): ');
    if (!nsecValue) throw new Error('Provide --nsec <nsec>, --nsec-file <path>, $OBELISK_NSEC[_FILE], or --bunker <uri>');
    const s = await loginWithNsec(baseUrl, nsecValue);
    console.log(`Logged in as ${s.pubkey} @ ${s.baseUrl}`);
    return 0;
  }

  if (group === 'generate') {
    const outPath = flagString(flags, 'out') ?? DEFAULT_KEY_FILE;
    const force = flags.force === true;
    const result = generateKeyFile(outPath, { force });
    console.error(`# Key written to ${result.path} (mode 0600).`);
    console.error(`# Next: promote this pubkey with an existing owner session:`);
    console.error(`#   npm run admin -- members role <serverId> ${result.pubkeyHex} --role admin`);
    console.error(`# Then log in: npm run admin -- login --nsec-file ${result.path}`);
    console.log(JSON.stringify(result));
    return 0;
  }

  if (group === 'logout') {
    logout();
    console.log('Session cleared.');
    return 0;
  }

  if (group === 'whoami') {
    const s = whoami();
    if (!s) { console.log('Not logged in.'); return 1; }
    console.log(JSON.stringify(s, null, 2));
    return 0;
  }

  // Escape hatch
  if (group === 'exec') {
    if (!sub || positional.length < 1) throw new Error('Usage: exec <METHOD> <path> [--body JSON]');
    const method = sub;
    const pathname = positional[0];
    const body = parseJsonFlag(flagString(flags, 'body'), 'body');
    print(await Api.exec(method, pathname, body));
    return 0;
  }

  // Admin commands
  switch (group) {
    case 'servers': {
      if (sub === 'list') { print(await Api.listServers()); return 0; }
      if (sub === 'sync') {
        const ids: string[] = positional[0]
          ? [positional[0]]
          : ((await Api.listServers()) as Array<{ id: string }>).map((s) => s.id);
        const out: any[] = [];
        for (const id of ids) {
          const view = await Api.getServerView(id);
          const existing = loadServerMemory(id);
          const existingChannels = new Map((existing?.channels ?? []).map((c) => [c.id, c]));
          const flatChannels: any[] = [
            ...(view.channels ?? []),
            ...((view.categories ?? []).flatMap((c: any) => c.channels ?? [])),
          ];
          const channels: CachedChannel[] = flatChannels.map((c: any) => {
            const prev = existingChannels.get(c.id);
            return {
              id: c.id, name: c.name, description: c.description ?? null,
              emoji: c.emoji ?? null, type: c.type, categoryId: c.categoryId ?? null,
              position: c.position, writePermission: c.writePermission ?? null,
              readPermission: c.readPermission ?? null,
              writeRoleIds: c.writeRoleIds ?? [], readRoleIds: c.readRoleIds ?? [],
              lastScannedAt: prev?.lastScannedAt,
              lastScannedMessageId: prev?.lastScannedMessageId ?? null,
              recentMessages: prev?.recentMessages ?? [],
            };
          });
          const mem: ServerMemory = {
            serverId: id,
            server: view.server,
            categories: (view.categories ?? []).map((c: any) => ({ id: c.id, name: c.name, position: c.position })),
            channels,
            syncedAt: new Date().toISOString(),
            scannedAt: existing?.scannedAt,
          };
          saveServerMemory(mem);
          out.push({ serverId: id, channels: channels.length });
        }
        print(out);
        return 0;
      }
      if (sub === 'memory') {
        if (positional[0]) {
          const mem = loadServerMemory(positional[0]);
          if (!mem) { console.error(`No memory for serverId=${positional[0]}. Run: servers sync ${positional[0]}`); return 1; }
          print(mem);
          return 0;
        }
        print({ cached: listServerMemories() });
        return 0;
      }
      if (sub === 'scan') {
        const serverId = positional[0];
        if (!serverId) throw new Error('Usage: servers scan <serverId> [--limit N] [--force] [--channel <id>]');
        const limit = Number(flagString(flags, 'limit') ?? 50);
        const force = flags.force === true;
        const only = flagString(flags, 'channel');
        let mem = loadServerMemory(serverId);
        if (!mem) {
          console.error(`No memory for serverId=${serverId}. Running sync first...`);
          // Inline sync
          const view = await Api.getServerView(serverId);
          const flatChannels: any[] = [
            ...(view.channels ?? []),
            ...((view.categories ?? []).flatMap((c: any) => c.channels ?? [])),
          ];
          mem = {
            serverId,
            server: view.server,
            categories: (view.categories ?? []).map((c: any) => ({ id: c.id, name: c.name, position: c.position })),
            channels: flatChannels.map((c: any) => ({
              id: c.id, name: c.name, description: c.description ?? null,
              emoji: c.emoji ?? null, type: c.type, categoryId: c.categoryId ?? null,
              position: c.position, writePermission: c.writePermission ?? null,
              readPermission: c.readPermission ?? null,
              writeRoleIds: c.writeRoleIds ?? [], readRoleIds: c.readRoleIds ?? [],
              lastScannedMessageId: null, recentMessages: [],
            })),
            syncedAt: new Date().toISOString(),
          };
        }

        const summary: any[] = [];
        for (const ch of mem.channels) {
          if (only && ch.id !== only) continue;
          if (ch.type !== 'text' && ch.type !== 'forum') {
            summary.push({ channelId: ch.id, name: ch.name, skipped: `type=${ch.type}` });
            continue;
          }
          let res: { messages: Array<any>; nextCursor: string | null };
          try {
            res = await Api.getMessages(ch.id, limit);
          } catch (err: any) {
            summary.push({ channelId: ch.id, name: ch.name, error: err.message });
            continue;
          }
          const fetched: CachedMessage[] = res.messages.map((m: any) => ({
            id: m.id, authorPubkey: m.authorPubkey, content: m.content,
            createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date(m.createdAt).toISOString(),
            replyToId: m.replyToId ?? null,
          }));
          const newestId = fetched.length > 0 ? fetched[fetched.length - 1].id : null;
          if (!force && isChannelUpToDate(newestId, ch.lastScannedMessageId)) {
            summary.push({ channelId: ch.id, name: ch.name, fetched: fetched.length, new: 0, upToDate: true });
            continue;
          }
          const { messages, newCursor, newCount } = mergeMessages(ch.recentMessages, fetched, ch.lastScannedMessageId);
          ch.recentMessages = messages;
          ch.lastScannedMessageId = newCursor;
          ch.lastScannedAt = new Date().toISOString();
          summary.push({
            channelId: ch.id, name: ch.name, description: ch.description,
            fetched: fetched.length, new: newCount, total: messages.length,
          });
        }
        mem.scannedAt = new Date().toISOString();
        saveServerMemory(mem);
        print(summary);
        return 0;
      }
      break;
    }
    case 'server': {
      const serverId = positional[0];
      if (sub === 'get') { print(await Api.getServer(serverId)); return 0; }
      if (sub === 'edit') { print(await Api.editServer(serverId, parseJsonFlag(requireFlag(flags, 'patch'), 'patch'))); return 0; }
      if (sub === 'delete') { print(await Api.deleteServer(serverId)); return 0; }
      if (sub === 'join-mode') {
        const mode = requireFlag(flags, 'mode') as 'open' | 'invite';
        print(await Api.setJoinMode(serverId, mode));
        return 0;
      }
      break;
    }
    case 'categories': {
      if (sub === 'list') { print(await Api.listCategories(positional[0])); return 0; }
      if (sub === 'create') { print(await Api.createCategory(positional[0], parseJsonFlag(requireFlag(flags, 'payload'), 'payload'))); return 0; }
      if (sub === 'edit') { print(await Api.editCategory(positional[0], parseJsonFlag(requireFlag(flags, 'patch'), 'patch'))); return 0; }
      if (sub === 'delete') { print(await Api.deleteCategory(positional[0])); return 0; }
      break;
    }
    case 'channels': {
      if (sub === 'list') { print(await Api.listChannels(positional[0])); return 0; }
      if (sub === 'topics' || sub === 'route-prep') {
        const serverId = positional[0];
        if (!serverId) throw new Error(`Usage: channels ${sub} <serverId> [--missing]`);
        // route-prep = topics but refreshes the cache first, so an agent can
        // do the full classifier prep in a single call.
        if (sub === 'route-prep') {
          const view = await Api.getServerView(serverId);
          const existing = loadServerMemory(serverId);
          const existingChannels = new Map((existing?.channels ?? []).map((c) => [c.id, c]));
          const flatChannels: any[] = [
            ...(view.channels ?? []),
            ...((view.categories ?? []).flatMap((c: any) => c.channels ?? [])),
          ];
          const channels: CachedChannel[] = flatChannels.map((c: any) => {
            const prev = existingChannels.get(c.id);
            return {
              id: c.id, name: c.name, description: c.description ?? null,
              emoji: c.emoji ?? null, type: c.type, categoryId: c.categoryId ?? null,
              position: c.position, writePermission: c.writePermission ?? null,
              readPermission: c.readPermission ?? null,
              writeRoleIds: c.writeRoleIds ?? [], readRoleIds: c.readRoleIds ?? [],
              lastScannedAt: prev?.lastScannedAt,
              lastScannedMessageId: prev?.lastScannedMessageId ?? null,
              recentMessages: prev?.recentMessages ?? [],
            };
          });
          saveServerMemory({
            serverId,
            server: view.server,
            categories: (view.categories ?? []).map((c: any) => ({ id: c.id, name: c.name, position: c.position })),
            channels,
            syncedAt: new Date().toISOString(),
            scannedAt: existing?.scannedAt,
          });
        }
        const mem = loadServerMemory(serverId);
        if (!mem) {
          console.error(`No memory for serverId=${serverId}. Run: servers sync ${serverId}`);
          return 1;
        }
        const missingOnly = sub === 'topics' && flags.missing === true;
        const catPos = new Map(mem.categories.map((c) => [c.id, c.position] as const));
        const catName = new Map(mem.categories.map((c) => [c.id, c.name] as const));
        const rows = mem.channels
          .filter((c) => c.type === 'text' || c.type === 'forum')
          .map((c) => {
            const desc = c.description && c.description.trim() ? c.description.trim() : null;
            return {
              channelId: c.id,
              name: c.name,
              emoji: c.emoji ?? null,
              category: c.categoryId ? (catName.get(c.categoryId) ?? null) : null,
              type: c.type,
              description: desc,
              writePermission: c.writePermission ?? null,
              _catPos: c.categoryId ? (catPos.get(c.categoryId) ?? 1e9) : -1,
              _chPos: c.position ?? 0,
            };
          })
          .filter((r) => (missingOnly ? r.description === null : true))
          .sort((a, b) => a._catPos - b._catPos || a._chPos - b._chPos)
          .map(({ _catPos, _chPos, ...rest }) => rest);
        if (sub === 'route-prep') {
          const missing = rows.filter((r) => r.description === null).map((r) => ({ channelId: r.channelId, name: r.name }));
          print({
            serverId: mem.serverId,
            syncedAt: mem.syncedAt,
            eligibleCount: rows.filter((r) => r.description !== null).length,
            missingCount: missing.length,
            missing,
            topics: rows.filter((r) => r.description !== null),
          });
        } else {
          print(rows);
        }
        return 0;
      }
      if (sub === 'create') { print(await Api.createChannel(positional[0], parseJsonFlag(requireFlag(flags, 'payload'), 'payload'))); return 0; }
      if (sub === 'edit') { print(await Api.editChannel(positional[0], parseJsonFlag(requireFlag(flags, 'patch'), 'patch'))); return 0; }
      if (sub === 'delete') { print(await Api.deleteChannel(positional[0])); return 0; }
      if (sub === 'messages') {
        const limit = Number(flagString(flags, 'limit') ?? 50);
        const cursor = flagString(flags, 'cursor');
        print(await Api.getMessages(positional[0], limit, cursor));
        return 0;
      }
      if (sub === 'post') {
        const content = requireFlag(flags, 'content');
        const replyTo = flagString(flags, 'reply-to');
        print(await Api.postMessage(positional[0], content, replyTo));
        return 0;
      }
      if (sub === 'suggest') {
        const sourceChannelId = positional[0];
        const targetChannelId = requireFlag(flags, 'target');
        const reason = flagString(flags, 'reason');
        const replyTo = flagString(flags, 'reply-to');
        const authorHex = flagString(flags, 'author');

        const target = findServerForChannel(targetChannelId);
        if (!target) {
          throw new Error(
            `Target channel ${targetChannelId} not found in local memory. Run: servers sync`,
          );
        }
        const content = composeSuggestion({
          targetChannelId,
          targetChannelName: target.channelName,
          authorMention: authorHex ? mentionToken(authorHex) : undefined,
          reason,
        });
        print(await Api.postMessage(sourceChannelId, content, replyTo));
        return 0;
      }
      break;
    }
    case 'alert': {
      // Usage: alert <serverId> --summary "..." [--channel <channelId>] [--link <url>]
      const serverId = sub; // when group='alert', sub is actually the positional serverId
      if (!serverId) throw new Error('Usage: alert <serverId> --summary "..." [--channel <id>] [--link <url>]');
      const summary = requireFlag(flags, 'summary');
      const link = flagString(flags, 'link');
      let channelId = flagString(flags, 'channel');

      const mem = loadServerMemory(serverId);
      if (!mem) throw new Error(`No memory for serverId=${serverId}. Run: servers sync ${serverId}`);
      if (!channelId) {
        const firstText = mem.channels.find((c) => c.type === 'text');
        if (!firstText) throw new Error('No text channel found in memory; pass --channel explicitly');
        channelId = firstText.id;
      }

      // Collect owner + admin pubkeys via the live API (authoritative).
      const members = (await Api.listMembers(serverId)) as { members?: Array<any> } | Array<any>;
      const rows = Array.isArray(members) ? members : (members.members ?? []);
      const toNotify = new Set<string>();
      const ownerPubkey = (mem.server as any)?.ownerPubkey;
      if (ownerPubkey) toNotify.add(ownerPubkey.toLowerCase());
      for (const m of rows) {
        if (m?.role === 'owner' || m?.role === 'admin') {
          if (typeof m.pubkey === 'string') toNotify.add(m.pubkey.toLowerCase());
        }
      }
      const content = composeAlert({ summary, link, mentions: Array.from(toNotify) });
      print(await Api.postMessage(channelId, content));
      return 0;
    }
    case 'roles': {
      if (sub === 'list') { print(await Api.listRoles(positional[0])); return 0; }
      if (sub === 'create') { print(await Api.createRole(positional[0], parseJsonFlag(requireFlag(flags, 'payload'), 'payload'))); return 0; }
      if (sub === 'edit') { print(await Api.editRole(positional[0], parseJsonFlag(requireFlag(flags, 'patch'), 'patch'))); return 0; }
      if (sub === 'delete') { print(await Api.deleteRole(positional[0])); return 0; }
      if (sub === 'assign') { print(await Api.assignRole(positional[0], requireFlag(flags, 'pubkey'))); return 0; }
      if (sub === 'unassign') { print(await Api.unassignRole(positional[0], requireFlag(flags, 'pubkey'))); return 0; }
      break;
    }
    case 'members': {
      if (sub === 'list') { print(await Api.listMembers(positional[0])); return 0; }
      if (sub === 'role') { print(await Api.setMemberRole(positional[0], positional[1], requireFlag(flags, 'role') as any)); return 0; }
      if (sub === 'kick') { print(await Api.kick(positional[0], positional[1], flagString(flags, 'reason'))); return 0; }
      if (sub === 'ban') { print(await Api.ban(positional[0], positional[1], flagString(flags, 'reason'))); return 0; }
      if (sub === 'unban') { print(await Api.unban(positional[0], positional[1])); return 0; }
      break;
    }
    case 'messages': {
      if (sub === 'delete') { print(await Api.deleteMessage(requireFlag(flags, 'serverId'), positional[0])); return 0; }
      if (sub === 'post') {
        const content = requireFlag(flags, 'content');
        const replyTo = flagString(flags, 'reply-to');
        print(await Api.postMessage(positional[0], content, replyTo));
        return 0;
      }
      break;
    }
    case 'instance': {
      if (sub === 'get') { print(await Api.instanceSettingsGet()); return 0; }
      if (sub === 'set') { print(await Api.instanceSettingsSet(parseJsonFlag(requireFlag(flags, 'patch'), 'patch'))); return 0; }
      break;
    }
  }

  console.error(`Unknown command: ${group} ${sub ?? ''}\n`);
  console.error(HELP);
  return 2;
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    if (err instanceof ApiError) {
      console.error(`API error ${err.status}: ${err.bodyJson?.error ?? err.bodyText}`);
    } else {
      console.error(err?.message ?? String(err));
    }
    process.exit(1);
  }
);
