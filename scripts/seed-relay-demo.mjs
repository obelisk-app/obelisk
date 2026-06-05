#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { finalizeEvent, generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

const KIND_GROUP_MESSAGE = 9;
const KIND_REACTION = 7;
const KIND_NIP78_APP_DATA = 30078;
const KIND_GROUP_CREATE = 9007;
const KIND_GROUP_EDIT_METADATA = 9002;
const KIND_GROUP_PUT_USER = 9000;
const KIND_AUTH = 22242;
const KIND_BLOSSOM_AUTH = 24242;

const DEFAULT_RELAY = 'wss://relay.fabriok.ar';

const textChannels = [
  ['general', 'General', 'Daily coordination, questions, and lightweight status drops.', 'welcome'],
  ['announcements', 'Announcements', 'Operator notes, release calls, and scheduled relay changes.', 'welcome'],
  ['rules-and-faq', 'Rules & FAQ', 'Pinned onboarding notes, client compatibility expectations, and common questions.', 'welcome'],
  ['release-notes', 'Release Notes', 'Release summaries, deploy notes, and compatibility deltas.', 'welcome'],
  ['builders', 'Builders', 'Implementation chat for clients, relay code, and protocol glue.', 'build'],
  ['client-dev', 'Client Dev', 'Client integration notes for indexed bootstrap, NIP-29, auth, and pagination.', 'build'],
  ['relay-dev', 'Relay Dev', 'Relay implementation details, storage behavior, and processor discussions.', 'build'],
  ['protocol-lab', 'Protocol Lab', 'Interop experiments, NIP notes, and wire-format checks.', 'build'],
  ['testing', 'Testing', 'Manual QA, seeded data checks, and regression notes.', 'build'],
  ['design-lab', 'Design Lab', 'UI experiments, visual feedback, and product polish.', 'media'],
  ['media-dump', 'Media Dump', 'Images, links, screenshots, and visual references.', 'media'],
  ['screenshots', 'Screenshots', 'Client screenshot drops and rendering checks.', 'media'],
  ['assets', 'Assets', 'Icons, banners, profile imagery, and reusable media references.', 'media'],
  ['support', 'Support', 'Troubleshooting, bug reports, and onboarding help.', 'support'],
  ['bug-reports', 'Bug Reports', 'Reproduction notes, expected behavior, and observed behavior.', 'support'],
  ['help-desk', 'Help Desk', 'Quick user support, FAQ follow-up, and setup checks.', 'support'],
  ['market', 'Market', 'Pricing, deployment costs, infra notes, and resource planning.', 'ops'],
  ['infra', 'Infrastructure', 'Docker, deployment, storage, and network operations.', 'ops'],
  ['observability', 'Observability', 'Metrics, logs, traces, dashboards, and health checks.', 'ops'],
  ['moderation', 'Moderation', 'Roles, deletes, membership, and policy examples.', 'ops'],
  ['wallets', 'Wallets', 'NWC, zaps, Cashu, invoices, and payment UX.', 'labs'],
  ['bots', 'Bots', 'Automation, assistants, relay workers, and future bot UX.', 'labs'],
  ['random', 'Random', 'Low stakes conversation and ambient lorem ipsum.', 'labs'],
  ['archive', 'Archive', 'Old notes, migration tests, and compatibility snapshots.', 'labs'],
];

const voiceChannels = [
  ['voice-lounge', 'Voice Lounge', 'Small-room voice channel for quick syncs.', 'voice', 'voice'],
  ['pairing-room', 'Pairing Room', 'Small-room voice channel for pair debugging.', 'voice', 'voice'],
  ['stage-hall', 'Stage Hall', 'Large-room SFU voice channel for presentations.', 'voice-sfu', 'voice'],
  ['town-square', 'Town Square', 'Large-room SFU voice channel for community sessions.', 'voice-sfu', 'voice'],
];

const forumDefs = [
  {
    id: 'forum-ideas',
    name: 'Ideas Forum',
    about: 'Long-form product ideas, design proposals, and roadmap threads.',
    tags: [
      ['proposal', 'Proposal', '💡'],
      ['ux', 'UX', '🎨'],
      ['infra', 'Infra', '🧱'],
    ],
    threads: [
      ['thread-index-bootstrap', 'Indexed bootstrap rollout notes', ['proposal', 'infra']],
      ['thread-mobile-first-paint', 'Mobile first-paint improvements', ['ux']],
      ['thread-channel-discovery', 'Channel discovery and search polish', ['proposal', 'ux']],
      ['thread-resource-budgeting', 'Relay resource budget scenarios', ['infra']],
      ['thread-search-command-palette', 'Search and command palette design', ['proposal', 'ux']],
      ['thread-embedded-media', 'Embedded media rendering checklist', ['ux']],
      ['thread-client-cache', 'Client cache invalidation strategy', ['infra']],
      ['thread-onboarding-flow', 'Onboarding flow polish', ['proposal']],
    ],
  },
  {
    id: 'forum-support',
    name: 'Support Forum',
    about: 'Troubleshooting threads for clients, relays, media, and auth flows.',
    tags: [
      ['auth', 'Auth', '🔐'],
      ['media', 'Media', '🖼️'],
      ['relay', 'Relay', '📡'],
    ],
    threads: [
      ['thread-nsec-login', 'nsec login recovery checklist', ['auth']],
      ['thread-image-rendering', 'Images not rendering on slow networks', ['media']],
      ['thread-rate-limits', 'Rate limits and fallback behavior', ['relay']],
      ['thread-private-groups', 'Private group visibility checks', ['auth', 'relay']],
      ['thread-auth-challenges', 'NIP-42 auth challenge debugging', ['auth']],
      ['thread-upload-limits', 'Upload limits and media validation', ['media']],
      ['thread-relay-health', 'Relay health and restart checklist', ['relay']],
      ['thread-client-fallback', 'Client fallback steps for normal relays', ['relay']],
    ],
  },
  {
    id: 'forum-design',
    name: 'Design Forum',
    about: 'Structured discussions about channel hierarchy, mobile views, banners, and media surfaces.',
    tags: [
      ['mobile', 'Mobile', '📱'],
      ['desktop', 'Desktop', '🖥️'],
      ['brand', 'Brand', '🪪'],
    ],
    threads: [
      ['thread-mobile-sidebar', 'Mobile sidebar and channel switcher', ['mobile']],
      ['thread-desktop-density', 'Desktop density and scan behavior', ['desktop']],
      ['thread-relay-banner', 'Relay banner and header composition', ['brand']],
      ['thread-channel-icons', 'Channel icon style and defaults', ['brand']],
      ['thread-message-gallery', 'Message gallery layout', ['mobile', 'desktop']],
      ['thread-forum-thread-card', 'Forum thread card hierarchy', ['desktop']],
      ['thread-theme-contrast', 'Theme contrast and accessibility', ['brand']],
      ['thread-empty-states', 'Empty states for seeded channels', ['mobile']],
    ],
  },
  {
    id: 'forum-ops',
    name: 'Operations Forum',
    about: 'Long-form operational planning for storage, rate limits, backups, deployments, and incident drills.',
    tags: [
      ['deploy', 'Deploy', '🚀'],
      ['storage', 'Storage', '💾'],
      ['limits', 'Limits', '🚦'],
    ],
    threads: [
      ['thread-docker-rollout', 'Docker rollout without registry push', ['deploy']],
      ['thread-lmdb-growth', 'LMDB growth and seeded-data cleanup', ['storage']],
      ['thread-http-quotas', 'HTTP bootstrap quota scenarios', ['limits']],
      ['thread-websocket-quotas', 'WebSocket quota scenarios', ['limits']],
      ['thread-backup-restore', 'Backup and restore rehearsal', ['storage']],
      ['thread-cloudflare-routing', 'Cloudflare route and tunnel checks', ['deploy']],
      ['thread-pruner-policy', 'Pruner policy for public channels', ['storage']],
      ['thread-incident-runbook', 'Incident runbook draft', ['deploy']],
    ],
  },
];

const personaNames = [
  ['Ada Relay', 'Protocol operator'],
  ['Milo Client', 'Frontend implementer'],
  ['Nia Mobile', 'Mobile QA'],
  ['Theo Infra', 'Deployment engineer'],
  ['Luna Design', 'Product designer'],
  ['Rafa Media', 'Content curator'],
  ['Iris Support', 'Community support'],
  ['Sol Metrics', 'Observability'],
  ['Vera Docs', 'Documentation'],
  ['Max Wallet', 'Wallet integration'],
  ['Cata QA', 'Quality assurance'],
  ['Noor Search', 'Search and discovery'],
];

const fallbackMediaUrls = [
  'https://obelisk.fabriok.ar/pictures-for-posts/mobile-own-profile-view.png',
  'https://obelisk.fabriok.ar/pictures-for-posts/desktop-forums-view.png',
  'https://obelisk.fabriok.ar/pictures-for-posts/mobile-server-and-channels-view.png',
  'https://obelisk.fabriok.ar/pictures-for-posts/mobile-channel-view-with-sfu-test-peer-trasmission.png',
  'https://obelisk.fabriok.ar/pictures-for-posts/mobile-showcase-readme.png',
  'https://obelisk.fabriok.ar/pictures-for-posts/desktop-large-voice-channel-with-sfu-peer-trasmission-test.png',
  'https://obelisk.fabriok.ar/pictures-for-posts/mobile-login-modal.png',
  'https://obelisk.fabriok.ar/pictures-for-posts/dekstop-public-general-chat-view-with-member-list.png',
  'https://obelisk.fabriok.ar/og/guides/relay-groups.png',
  'https://obelisk.fabriok.ar/og/guides/how-obelisk-works.png',
  'https://obelisk.fabriok.ar/og/guides/future-relays.png',
  'https://obelisk.fabriok.ar/og/guides/admin-cli.png',
  'https://obelisk.fabriok.ar/obelisk.png',
  'https://obelisk.fabriok.ar/lacrypta-banner.png',
];

const blossomAssetFiles = [
  'public/pictures-for-posts/mobile-own-profile-view.png',
  'public/pictures-for-posts/desktop-forums-view.png',
  'public/pictures-for-posts/mobile-server-and-channels-view.png',
  'public/pictures-for-posts/mobile-channel-view-with-sfu-test-peer-trasmission.png',
  'public/pictures-for-posts/mobile-showcase-readme.png',
  'public/pictures-for-posts/desktop-large-voice-channel-with-sfu-peer-trasmission-test.png',
  'public/pictures-for-posts/mobile-login-modal.png',
  'public/pictures-for-posts/dekstop-public-general-chat-view-with-member-list.png',
  'public/og/guides/relay-groups.png',
  'public/og/guides/how-obelisk-works.png',
  'public/og/guides/future-relays.png',
  'public/og/guides/admin-cli.png',
];

const uploadServers = [
  'https://blossom.primal.net',
  'https://nostr.build',
  'https://blossom.band',
];

const layoutCategories = [
  ['welcome', 'Start Here'],
  ['build', 'Build'],
  ['media', 'Media & Design'],
  ['support', 'Support'],
  ['ops', 'Operations'],
  ['voice', 'Voice'],
  ['forums', 'Forums'],
  ['labs', 'Labs'],
];

const lorem = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
  'Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae.',
  'Integer facilisis, mauris a volutpat pharetra, nibh justo suscipit magna, vitae feugiat arcu justo non lectus.',
  'Suspendisse potenti; curabitur mattis mi non eros luctus, vitae placerat augue pulvinar.',
  'Donec viverra sapien ac massa dignissim, sed tempor risus dictum.',
  'Aliquam erat volutpat, sed dignissim augue nec lacus tristique, nec dictum mi facilisis.',
  'Praesent commodo justo id nulla dictum, non luctus sem consequat.',
  'Mauris id mauris et nibh egestas sollicitudin in sit amet ante.',
  'Aenean lacinia velit vel libero faucibus, nec varius nisl faucibus.',
  'Curabitur tempor ex sed sapien cursus, eu facilisis justo pretium.',
  'Quisque porttitor ipsum ac lacus faucibus, eu volutpat nulla suscipit.',
  'Etiam convallis nulla a arcu tempus, vel fermentum arcu malesuada.',
];

const messageTemplates = [
  'Quick checkpoint: {lorem} The current test path looks stable enough to inspect in a normal client.',
  'I attached a visual reference for this channel:\n{image}\n{lorem}',
  'Implementation note: `{code}` should stay compatible with normal relays. {lorem}',
  'For pagination testing, this message is intentionally ordinary and scrollable. {lorem}',
  'Reply chain seed: {lorem} We should verify that older messages load independently per chat.',
  'Media pass:\n{image}\nThe client should render this as inline media, not a generic link. {lorem}',
  'Operator note: {lorem} Rate limits for optimized bootstrap should remain separate from regular REQ limits.',
  'Forum-style long note: {lorem} {lorem} {lorem}',
  'Client fallback reminder: if indexed bootstrap is unavailable, normal Nostr subscriptions still work.',
  'Testing mentions, links, and body parsing in one place: https://obelisk.fabriok.ar/app {lorem}',
  'Mention test for {mention}: {lorem} The event also carries a matching p-tag.',
  '@everyone broadcast-style seed message for notification and highlight checks. {lorem}',
];

function usage() {
  console.log(`Usage:
  OBELISK_SEED_NSEC=nsec1... node scripts/seed-relay-demo.mjs [options]
  OBELISK_SEED_PRIVATE_KEY_HEX=<64-hex> node scripts/seed-relay-demo.mjs [options]
  node scripts/seed-relay-demo.mjs --secret-file /path/to/settings.local.yml [options]

Options:
  --relay <url>              WebSocket URL to publish to. Default: ${DEFAULT_RELAY}
  --auth-relay <url>         Relay URL used in NIP-42 auth event tags. Defaults to --relay.
  --namespace <slug>         Prefix for generated group ids. Default: demo-<timestamp>
  --users <n>                Generated demo personas. Default: 8
  --messages <n>             Messages per text/thread channel. Default: 36
  --single-author            Sign all messages with the seed key instead of generated personas.
  --upload-media             Upload local Obelisk PNG assets to Blossom before publishing.
  --no-branding-layout       Skip relay branding and channel-layout kind 30078 events.
  --dry-run                  Build the plan but do not connect or publish.
  --help                     Show this help.
`);
}

function parseArgs(argv) {
  const args = {
    relay: DEFAULT_RELAY,
    authRelay: null,
    namespace: null,
    users: 10,
    messages: 36,
    singleAuthor: false,
    uploadMedia: false,
    brandingLayout: true,
    dryRun: false,
    secretFile: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else if (arg === '--relay') {
      args.relay = mustValue(argv, ++i, arg);
    } else if (arg === '--auth-relay') {
      args.authRelay = mustValue(argv, ++i, arg);
    } else if (arg === '--namespace') {
      args.namespace = mustValue(argv, ++i, arg).replace(/[^a-zA-Z0-9_-]/g, '-');
    } else if (arg === '--users') {
      args.users = clampInt(mustValue(argv, ++i, arg), 1, personaNames.length);
    } else if (arg === '--messages') {
      args.messages = clampInt(mustValue(argv, ++i, arg), 1, 200);
    } else if (arg === '--single-author') {
      args.singleAuthor = true;
    } else if (arg === '--upload-media') {
      args.uploadMedia = true;
    } else if (arg === '--no-branding-layout') {
      args.brandingLayout = false;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--secret-file') {
      args.secretFile = mustValue(argv, ++i, arg);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  args.authRelay ??= args.relay;
  args.namespace ??= `demo-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').toLowerCase()}`;
  return args;
}

function mustValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function clampInt(value, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected integer between ${min} and ${max}, got ${value}`);
  }
  return parsed;
}

function hexToBytes(hex) {
  const clean = hex.trim().replace(/^0x/, '');
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new Error('Secret must be nsec or 64 hex characters');
  return Uint8Array.from(clean.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)));
}

function parseSecret(value) {
  const clean = value.trim();
  if (clean.startsWith('nsec')) {
    const decoded = nip19.decode(clean);
    if (decoded.type !== 'nsec') throw new Error('Expected nsec secret');
    return decoded.data;
  }
  return hexToBytes(clean);
}

function loadSecret(args) {
  const direct = process.env.OBELISK_SEED_NSEC
    || process.env.NSEC
    || process.env.OBELISK_SEED_PRIVATE_KEY_HEX
    || process.env.PRIVATE_KEY_HEX;
  if (direct) return parseSecret(direct);

  if (args.secretFile) {
    const text = fs.readFileSync(args.secretFile, 'utf8');
    const relayKey = text.match(/relay_secret_key:\s*["']?([^"'\s#]+)["']?/);
    if (relayKey?.[1]) return parseSecret(relayKey[1]);
    const nsec = text.match(/nsec1[023456789acdefghjklmnpqrstuvwxyz]+/i);
    if (nsec?.[0]) return parseSecret(nsec[0]);
    const hex = text.match(/\b[0-9a-fA-F]{64}\b/);
    if (hex?.[0]) return parseSecret(hex[0]);
    throw new Error(`No nsec or 64-hex secret found in ${args.secretFile}`);
  }

  throw new Error('Provide OBELISK_SEED_NSEC, OBELISK_SEED_PRIVATE_KEY_HEX, or --secret-file');
}

function pick(list, index) {
  return list[index % list.length];
}

function stableIndex(seed, modulo) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % modulo;
}

function isRenderableImageUrl(url) {
  return /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url);
}

function mediaFor(pool, seed) {
  if (pool.length === 0) return pick(fallbackMediaUrls, stableIndex(seed, fallbackMediaUrls.length));
  return pick(pool, stableIndex(seed, pool.length));
}

function mimeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

function uploadAuth(secretKey, fileHash) {
  return finalizeEvent({
    kind: KIND_BLOSSOM_AUTH,
    content: '',
    tags: [
      ['t', 'upload'],
      ['x', fileHash],
      ['expiration', String(Math.floor(Date.now() / 1000) + 3600)],
    ],
    created_at: Math.floor(Date.now() / 1000),
  }, secretKey);
}

function parseUploadUrl(data) {
  if (!data) return null;
  if (typeof data.url === 'string') return data.url;
  if (typeof data.download_url === 'string') return data.download_url;
  if (typeof data.href === 'string') return data.href;
  if (Array.isArray(data) && data[0]) return parseUploadUrl(data[0]);
  if (data.data) return parseUploadUrl(data.data);
  return null;
}

async function uploadMediaPool(secretKey) {
  const root = process.cwd();
  const uploaded = [];
  for (const relativePath of blossomAssetFiles) {
    const filePath = path.join(root, relativePath);
    if (!fs.existsSync(filePath)) continue;
    const bytes = fs.readFileSync(filePath);
    const fileHash = bytesToHex(sha256(bytes));
    const auth = Buffer.from(JSON.stringify(uploadAuth(secretKey, fileHash))).toString('base64');
    let accepted = null;
    for (const server of uploadServers) {
      try {
        const res = await fetch(`${server}/upload`, {
          method: 'PUT',
          headers: {
            Authorization: `Nostr ${auth}`,
            'Content-Type': mimeForFile(filePath),
          },
          body: bytes,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => res.statusText);
          throw new Error(`${res.status} ${body.slice(0, 160)}`);
        }
        const data = await res.json().catch(() => null);
        const url = parseUploadUrl(data);
        if (url && isRenderableImageUrl(url)) {
          accepted = url;
          break;
        }
        if (url) {
          console.warn(`Blossom URL lacks image extension, skipping for inline rendering: ${url}`);
        }
      } catch (error) {
        console.warn(`Blossom upload failed on ${server} for ${relativePath}: ${error.message}`);
      }
    }
    if (accepted) {
      uploaded.push(accepted);
      console.log(`uploaded media ${uploaded.length}: ${accepted}`);
    }
  }
  return uploaded;
}

function mentionToken(pubkey) {
  return `nostr:npub1${pubkey}`;
}

function contentFor(group, messageIndex, authorIndex, priorEvent, mediaPool, mentionPersona) {
  const template = pick(messageTemplates, messageIndex + authorIndex + group.id.length);
  const media = mediaFor(mediaPool, `${group.id}-${messageIndex}`);
  const text = template
    .replaceAll('{lorem}', pick(lorem, messageIndex + authorIndex))
    .replaceAll('{image}', media)
    .replaceAll('{mention}', mentionPersona ? mentionToken(mentionPersona.pubkey) : '@everyone')
    .replaceAll('{code}', pick(['limit_per_group=50', 'since=cursor.since', 'kind: 9002', 'tag: ["h", groupId]', 'kind: 30078', '["d","obelisk:layout:<relay>"]'], messageIndex));
  if (priorEvent && messageIndex % 7 === 0) {
    return `${text}\n\nReplying to an earlier seed event so thread rendering can be checked.`;
  }
  if (messageIndex % 11 === 4) {
    return `${text}\n\n${mediaFor(mediaPool, `${group.id}-${messageIndex}-gallery-a`)}\n${mediaFor(mediaPool, `${group.id}-${messageIndex}-gallery-b`)}`;
  }
  if (messageIndex % 17 === 6) {
    return `${text}\n\nYouTube embed check: https://youtu.be/dQw4w9WgXcQ`;
  }
  return text;
}

function sign(secretKey, kind, tags, content, createdAt) {
  return finalizeEvent({ kind, tags, content, created_at: createdAt }, secretKey);
}

function groupTags(group) {
  const tags = [
    ['h', group.id],
    ['name', group.name],
    ['about', group.about],
    ['picture', group.picture],
    ['banner', group.banner],
    ['public'],
    ['open'],
  ];
  if (group.kind && group.kind !== 'text') tags.push(['t', group.kind]);
  if (group.parent) tags.push(['parent', group.parent]);
  for (const forumTag of group.forumTags ?? []) {
    tags.push(forumTag[2] ? ['forum-tag', forumTag[0], forumTag[1], forumTag[2]] : ['forum-tag', forumTag[0], forumTag[1]]);
  }
  for (const topic of group.topics ?? []) tags.push(['topic', topic]);
  return tags;
}

function buildGroups(namespace, mediaPool) {
  const groups = [];
  for (const [id, name, about, category] of textChannels) {
    groups.push({
      id: `${namespace}-${id}`,
      name,
      about,
      kind: 'text',
      category,
      picture: mediaFor(mediaPool, `${namespace}-${id}-picture`),
      banner: mediaFor(mediaPool, `${namespace}-${id}-banner`),
    });
  }
  for (const [id, name, about, kind, category] of voiceChannels) {
    groups.push({
      id: `${namespace}-${id}`,
      name,
      about,
      kind,
      category,
      picture: mediaFor(mediaPool, `${namespace}-${id}-picture`),
      banner: mediaFor(mediaPool, `${namespace}-${id}-banner`),
      lowTraffic: true,
    });
  }
  for (const forum of forumDefs) {
    const forumId = `${namespace}-${forum.id}`;
    groups.push({
      id: forumId,
      name: forum.name,
      about: forum.about,
      kind: 'forum',
      category: 'forums',
      picture: mediaFor(mediaPool, `${forumId}-picture`),
      banner: mediaFor(mediaPool, `${forumId}-banner`),
      forumTags: forum.tags,
      containerOnly: true,
    });
    for (const [threadId, name, topics] of forum.threads) {
      groups.push({
        id: `${namespace}-${threadId}`,
        name,
        about: `Thread under ${forum.name}. ${pick(lorem, threadId.length)}`,
        kind: 'text',
        parent: forumId,
        category: 'forums',
        topics,
        picture: mediaFor(mediaPool, `${namespace}-${threadId}-picture`),
        banner: mediaFor(mediaPool, `${namespace}-${threadId}-banner`),
      });
    }
  }
  return groups;
}

function buildPersonas(count, seedSecret) {
  const seedPubkey = getPublicKey(seedSecret);
  const personas = [{ name: 'Relay Seeder', role: 'Seed admin', secretKey: seedSecret, pubkey: seedPubkey, seed: true }];
  for (let i = 0; i < count; i += 1) {
    const [name, role] = personaNames[i];
    const secretKey = generateSecretKey();
    personas.push({ name, role, secretKey, pubkey: getPublicKey(secretKey), seed: false });
  }
  return personas;
}

function buildBrandingEvent(args, seedSecret, mediaPool, groupId, createdAt) {
  return sign(
    seedSecret,
    KIND_NIP78_APP_DATA,
    [
      ['h', groupId],
      ['d', `obelisk:branding:${args.relay}`],
      ['icon', mediaFor(mediaPool, `${args.namespace}-relay-icon`)],
      ['banner', mediaFor(mediaPool, `${args.namespace}-relay-banner`)],
      ['name', 'Fabriok Test Relay'],
      ['description', 'Seeded Obelisk test relay with organized channels, forums, voice rooms, media, mentions, replies, and bootstrap-scale history.'],
    ],
    '',
    createdAt,
  );
}

function buildLayoutEvent(args, seedSecret, groups, groupId, createdAt) {
  const tags = [
    ['h', groupId],
    ['d', `obelisk:layout:${args.relay}`],
  ];
  for (let i = 0; i < layoutCategories.length; i += 1) {
    const [id, name] = layoutCategories[i];
    tags.push(['category', id, name, String(i)]);
  }

  let position = 0;
  for (const category of layoutCategories.map((item) => item[0])) {
    for (const group of groups.filter((item) => item.category === category)) {
      tags.push(['channel', group.id, category, String(position++)]);
    }
  }
  for (const group of groups.filter((item) => !item.category)) {
    tags.push(['channel', group.id, '', String(position++)]);
  }

  return sign(seedSecret, KIND_NIP78_APP_DATA, tags, '', createdAt);
}

function buildPlan(args, seedSecret, mediaPool) {
  const seedPubkey = getPublicKey(seedSecret);
  const personas = buildPersonas(args.users, seedSecret);
  const authors = args.singleAuthor ? [personas[0]] : personas;
  const groups = buildGroups(args.namespace, mediaPool);
  const base = Math.floor(Date.now() / 1000) - 7200;
  let tick = 0;
  const nextTime = () => base + tick++;
  const events = [];
  const messagesByGroup = new Map();

  for (const group of groups) {
    events.push({ event: sign(seedSecret, KIND_GROUP_CREATE, [['h', group.id]], '', nextTime()), label: `create ${group.id}`, optional: false });
    events.push({ event: sign(seedSecret, KIND_GROUP_EDIT_METADATA, groupTags(group), '', nextTime()), label: `metadata ${group.id}`, optional: false });
  }

  for (const group of groups) {
    for (const persona of personas) {
      events.push({
        event: sign(seedSecret, KIND_GROUP_PUT_USER, [['h', group.id], ['p', persona.pubkey, persona.seed ? 'admin' : 'member']], '', nextTime()),
        label: `member ${persona.name} -> ${group.id}`,
        optional: true,
      });
    }
  }

  if (args.brandingLayout) {
    const anchorGroupId = `${args.namespace}-general`;
    events.push({
      event: buildBrandingEvent(args, seedSecret, mediaPool, anchorGroupId, nextTime()),
      label: 'relay branding',
      optional: false,
    });
    events.push({
      event: buildLayoutEvent(args, seedSecret, groups, anchorGroupId, nextTime()),
      label: 'channel layout',
      optional: false,
    });
  }

  const messageGroups = groups.filter((group) => !group.containerOnly);
  for (const group of messageGroups) {
    const perGroup = group.lowTraffic ? Math.min(6, args.messages) : args.messages;
    const sent = [];
    for (let i = 0; i < perGroup; i += 1) {
      const author = pick(authors, i + group.id.length);
      const mentionPersona = personas.length > 1 ? pick(personas.slice(1), i + group.id.length + 3) : null;
      const prior = sent.length > 0 ? pick(sent, i - 1) : null;
      const tags = [['h', group.id]];
      if (prior && i % 7 === 0) {
        tags.push(['e', prior.id, '', 'reply']);
        tags.push(['p', prior.pubkey]);
      }
      if (mentionPersona && (i % 6 === 1 || i % 13 === 5)) {
        tags.push(['p', mentionPersona.pubkey]);
      }
      if (i % 9 === 0) {
        tags.unshift(['emoji', 'obelisk', mediaFor(mediaPool, `emoji-${group.id}-${i}`)]);
      }
      const event = sign(author.secretKey, KIND_GROUP_MESSAGE, tags, contentFor(group, i, authors.indexOf(author), prior, mediaPool, mentionPersona), nextTime());
      sent.push(event);
      events.push({ event, label: `message ${group.id}`, optional: false });

      if (i % 5 === 2) {
        const reactor = pick(authors, i + 2);
        events.push({
          event: sign(
            reactor.secretKey,
            KIND_REACTION,
            [['e', event.id], ['p', event.pubkey], ['h', group.id]],
            pick(['+', '🔥', '🫡', '👀', '💚'], i),
            nextTime(),
          ),
          label: `reaction ${group.id}`,
          optional: true,
        });
      }
    }
    messagesByGroup.set(group.id, sent.length);
  }

  return { seedPubkey, personas, groups, messageGroups, events, messagesByGroup };
}

class Publisher {
  constructor(relay, authRelay, secretKey, label) {
    this.relay = relay;
    this.authRelay = authRelay;
    this.secretKey = secretKey;
    this.label = label;
    this.pending = new Map();
    this.notices = [];
    this.opened = false;
  }

  async connect() {
    if (typeof WebSocket === 'undefined') {
      throw new Error('This Node runtime does not provide WebSocket. Use Node 22+.');
    }
    this.ws = new WebSocket(this.relay);
    this.ws.addEventListener('message', (message) => this.handleMessage(message));
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out connecting to ${this.relay}`)), 12_000);
      this.ws.addEventListener('open', () => {
        clearTimeout(timeout);
        this.opened = true;
        resolve();
      }, { once: true });
      this.ws.addEventListener('error', () => reject(new Error(`Failed connecting to ${this.relay}`)), { once: true });
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  handleMessage(message) {
    let raw = message.data;
    if (raw instanceof ArrayBuffer) raw = Buffer.from(raw).toString('utf8');
    if (ArrayBuffer.isView(raw)) raw = Buffer.from(raw.buffer).toString('utf8');
    if (typeof raw !== 'string') raw = String(raw);

    let frame;
    try {
      frame = JSON.parse(raw);
    } catch {
      return;
    }

    if (!Array.isArray(frame)) return;
    if (frame[0] === 'AUTH' && typeof frame[1] === 'string') {
      const authEvent = sign(
        this.secretKey,
        KIND_AUTH,
        [['relay', this.authRelay], ['challenge', frame[1]]],
        '',
        Math.floor(Date.now() / 1000),
      );
      this.ws.send(JSON.stringify(['AUTH', authEvent]));
      return;
    }
    if (frame[0] === 'NOTICE') {
      this.notices.push(String(frame[1] ?? ''));
      return;
    }
    if (frame[0] === 'OK') {
      const [, id, accepted, reason] = frame;
      const waiter = this.pending.get(id);
      if (!waiter) return;
      clearTimeout(waiter.timeout);
      this.pending.delete(id);
      if (accepted) waiter.resolve({ accepted: true, reason: String(reason ?? '') });
      else waiter.reject(new Error(String(reason || 'relay rejected event')));
    }
  }

  async publish(event, label, optional = false) {
    if (!this.opened || this.ws.readyState !== WebSocket.OPEN) throw new Error(`Publisher ${this.label} is not connected`);
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(event.id);
        reject(new Error(`Timed out waiting for OK on ${label}`));
      }, 15_000);
      this.pending.set(event.id, { resolve, reject, timeout });
      this.ws.send(JSON.stringify(['EVENT', event]));
    }).catch((error) => {
      if (optional) return { accepted: false, reason: error.message };
      throw error;
    });
    return result;
  }

  close() {
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const seedSecret = loadSecret(args);
  let mediaPool = fallbackMediaUrls;

  if (args.uploadMedia && !args.dryRun) {
    console.log('Uploading media assets to Blossom...');
    const uploaded = await uploadMediaPool(seedSecret);
    if (uploaded.length > 0) {
      mediaPool = uploaded;
      console.log(`Using ${uploaded.length} Blossom media URLs for channel banners and message galleries.`);
    } else {
      console.warn('No renderable Blossom URLs returned; falling back to extension-bearing public Obelisk media URLs.');
    }
  }

  const plan = buildPlan(args, seedSecret, mediaPool);

  console.log(`Relay: ${args.relay}`);
  console.log(`Auth relay tag: ${args.authRelay}`);
  console.log(`Namespace: ${args.namespace}`);
  console.log(`Seed pubkey: ${plan.seedPubkey}`);
  console.log(`Groups: ${plan.groups.length} (${plan.messageGroups.length} message-bearing)`);
  console.log(`Personas: ${plan.personas.length}${args.singleAuthor ? ' (single-author mode)' : ''}`);
  console.log(`Media URLs: ${mediaPool.length}${args.uploadMedia && !args.dryRun ? ' (Blossom preferred)' : ''}`);
  console.log(`Branding/layout: ${args.brandingLayout ? 'yes' : 'no'}`);
  console.log(`Events planned: ${plan.events.length}`);

  if (args.dryRun) {
    for (const [groupId, count] of plan.messagesByGroup.entries()) {
      console.log(`  ${groupId}: ${count} messages`);
    }
    return;
  }

  const publishers = new Map();
  const getPublisher = async (secretKey) => {
    const pubkey = getPublicKey(secretKey);
    let publisher = publishers.get(pubkey);
    if (!publisher) {
      publisher = new Publisher(args.relay, args.authRelay, secretKey, pubkey.slice(0, 10));
      await publisher.connect();
      publishers.set(pubkey, publisher);
    }
    return publisher;
  };

  let ok = 0;
  let skipped = 0;
  const started = Date.now();

  try {
    for (let i = 0; i < plan.events.length; i += 1) {
      const item = plan.events[i];
      const publisher = await getPublisher(secretForEvent(item.event.pubkey, plan.personas, seedSecret));
      const result = await publisher.publish(item.event, item.label, item.optional);
      if (result.accepted) ok += 1;
      else {
        skipped += 1;
        console.warn(`optional rejected: ${item.label}: ${result.reason}`);
      }
      if ((i + 1) % 50 === 0 || i + 1 === plan.events.length) {
        console.log(`published ${i + 1}/${plan.events.length}`);
      }
    }
  } finally {
    for (const publisher of publishers.values()) publisher.close();
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Done: accepted=${ok}, optional_rejected=${skipped}, elapsed=${seconds}s`);
}

function secretForEvent(pubkey, personas, seedSecret) {
  const persona = personas.find((item) => item.pubkey === pubkey);
  return persona?.secretKey ?? seedSecret;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
