import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fanOutMentions } from './mention-fanout';
import { serializeMention } from './mentions';

vi.mock('@/lib/channel-access', () => ({
  resolveMemberAccess: vi.fn(async () => ({ role: 'member', customRoleIds: [] })),
}));

vi.mock('@/lib/instance-owner', () => ({
  isInstanceOwner: vi.fn(() => false),
}));

function makeIo() {
  const emitted: Array<{ room: string; event: string; payload: any }> = [];
  return {
    emitted,
    to(room: string) {
      return {
        emit(event: string, payload: any) {
          emitted.push({ room, event, payload });
        },
      };
    },
  };
}

function makePrisma(overrides: Partial<any> = {}) {
  return {
    mention: { createMany: vi.fn(async () => ({ count: 0 })) },
    member: {
      findMany: vi.fn(async () => []),
      // Default: every candidate is a member of the server. Individual tests
      // override via the `member.findUnique` spy to simulate a non-member.
      findUnique: vi.fn(async () => ({ id: 'm-fake' })),
    },
    server: { findUnique: vi.fn(async () => ({ ownerPubkey: 'zzz' })) },
    postSubscription: { createMany: vi.fn(async () => ({ count: 0 })) },
    ...overrides,
  } as any;
}

describe('fanOutMentions', () => {
  const author = 'a'.repeat(64);
  const mentioned = 'b'.repeat(64);
  const other = 'c'.repeat(64);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits notification + post-unread with hasMention:true for each mentioned user', async () => {
    const io = makeIo();
    const prisma = makePrisma();
    const content = `Hey ${serializeMention(mentioned)} look at this`;

    const result = await fanOutMentions({
      prisma,
      io: io as any,
      messageId: 'msg1',
      channelId: 'ch1',
      serverId: 'srv1',
      authorPubkey: author,
      content,
      postId: 'post1',
      channel: { readPermission: null },
      createdAt: new Date(),
    });

    expect(result.mentionedPubkeys).toEqual([mentioned]);
    // Mention row persisted
    expect(prisma.mention.createMany).toHaveBeenCalledWith({
      data: [{ messageId: 'msg1', pubkey: mentioned, channelId: 'ch1' }],
      skipDuplicates: true,
    });
    // Notification emitted to the mentioned user's room
    const notifs = io.emitted.filter((e) => e.event === 'notification');
    expect(notifs).toHaveLength(1);
    expect(notifs[0].room).toBe(`pubkey:${mentioned}`);
    expect(notifs[0].payload).toMatchObject({
      type: 'mention',
      channelId: 'ch1',
      postId: 'post1',
      senderPubkey: author,
    });
    // post-unread with hasMention flag
    const postUnreads = io.emitted.filter((e) => e.event === 'post-unread');
    expect(postUnreads).toHaveLength(1);
    expect(postUnreads[0].payload).toMatchObject({
      postId: 'post1',
      hasMention: true,
    });
  });

  it('never notifies the author about their own mention-self', async () => {
    const io = makeIo();
    const prisma = makePrisma();
    const content = `Hey ${serializeMention(author)}`;

    const result = await fanOutMentions({
      prisma,
      io: io as any,
      messageId: 'msg1',
      channelId: 'ch1',
      serverId: 'srv1',
      authorPubkey: author,
      content,
      channel: { readPermission: null },
      createdAt: new Date(),
    });

    expect(result.mentionedPubkeys).toEqual([author]);
    expect(prisma.mention.createMany).not.toHaveBeenCalled();
    expect(io.emitted).toHaveLength(0);
  });

  it('treats a reply target as an implicit mention (type=reply)', async () => {
    const io = makeIo();
    const prisma = makePrisma();

    await fanOutMentions({
      prisma,
      io: io as any,
      messageId: 'msg1',
      channelId: 'ch1',
      serverId: 'srv1',
      authorPubkey: author,
      content: 'thanks',
      replyToAuthorPubkey: other,
      channel: { readPermission: null },
      createdAt: new Date(),
    });

    const notifs = io.emitted.filter((e) => e.event === 'notification');
    expect(notifs).toHaveLength(1);
    expect(notifs[0].payload.type).toBe('reply');
    expect(notifs[0].room).toBe(`pubkey:${other}`);
  });

  it('drops notification when recipient is not a server member', async () => {
    const io = makeIo();
    const prisma = makePrisma({
      member: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null), // not a member
      },
    });

    await fanOutMentions({
      prisma,
      io: io as any,
      messageId: 'msg1',
      channelId: 'ch1',
      serverId: 'srv1',
      authorPubkey: author,
      content: `${serializeMention(mentioned)} hi`,
      channel: { readPermission: null },
      createdAt: new Date(),
    });

    expect(io.emitted).toHaveLength(0);
    expect(prisma.mention.createMany).not.toHaveBeenCalled();
  });

  it('includes recipientPubkey on every emitted notification', async () => {
    const io = makeIo();
    const prisma = makePrisma();

    await fanOutMentions({
      prisma,
      io: io as any,
      messageId: 'msg1',
      channelId: 'ch1',
      serverId: 'srv1',
      authorPubkey: author,
      content: `${serializeMention(mentioned)} hi`,
      channel: { readPermission: null },
      createdAt: new Date(),
    });

    const notifs = io.emitted.filter((e) => e.event === 'notification');
    expect(notifs[0].payload.recipientPubkey).toBe(mentioned);
  });

  it('is unconditional — does not consult PostSubscription', async () => {
    // The helper never calls postSubscription.findMany — mentions are
    // delivered regardless of subscription state.
    const io = makeIo();
    const prisma = makePrisma({
      postSubscription: { findMany: vi.fn(async () => []) },
    });

    await fanOutMentions({
      prisma,
      io: io as any,
      messageId: 'msg1',
      channelId: 'ch1',
      serverId: 'srv1',
      authorPubkey: author,
      content: `${serializeMention(mentioned)} hi`,
      postId: 'post1',
      channel: { readPermission: null },
      createdAt: new Date(),
    });

    expect(prisma.postSubscription.findMany).not.toHaveBeenCalled();
    expect(io.emitted.some((e) => e.event === 'notification')).toBe(true);
  });
});
