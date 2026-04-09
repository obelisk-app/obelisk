import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Wipe and re-seed
  await prisma.message.deleteMany();
  await prisma.channel.deleteMany();
  await prisma.category.deleteMany();
  await prisma.member.deleteMany();
  await prisma.server.deleteMany();

  const server = await prisma.server.create({
    data: {
      name: 'La Crypta',
      icon: '/lacrypta-logo.png',
      banner: '/lacrypta-banner.png',
      ownerPubkey: 'd9590d95a7811e1cb312be66edd664d7e3e6ed57822ad9f213ed620fc6748be8',
    },
  });

  // ── Categories matching Discord screenshots ──

  const oficial = await prisma.category.create({
    data: { serverId: server.id, name: 'OFICIAL', position: 0 },
  });

  const merito = await prisma.category.create({
    data: { serverId: server.id, name: 'MÉRITO', position: 1 },
  });

  const voz = await prisma.category.create({
    data: { serverId: server.id, name: 'VOZ', position: 2 },
  });

  const texto = await prisma.category.create({
    data: { serverId: server.id, name: 'TEXTO', position: 3 },
  });

  const tech = await prisma.category.create({
    data: { serverId: server.id, name: 'TECH', position: 4 },
  });

  // ── Channels ──

  await prisma.channel.createMany({
    data: [
      // Pinned (no category)
      { serverId: server.id, categoryId: null, name: 'chat-general', emoji: '💬', position: 0 },

      // OFICIAL
      { serverId: server.id, categoryId: oficial.id, name: 'empezá-acá', emoji: '📌', position: 0 },
      { serverId: server.id, categoryId: oficial.id, name: 'indice', emoji: '📜', position: 1 },
      { serverId: server.id, categoryId: oficial.id, name: 'anuncios', emoji: '🏆', position: 2 },
      { serverId: server.id, categoryId: oficial.id, name: 'méritos', emoji: '🏅', position: 3 },
      { serverId: server.id, categoryId: oficial.id, name: 'las-3-cosas', emoji: '3️⃣', position: 4 },

      // MÉRITO
      { serverId: server.id, categoryId: merito.id, name: 'plata', emoji: '🥈', position: 0 },
      { serverId: server.id, categoryId: merito.id, name: 'acero', emoji: '🎖️', position: 1 },

      // VOZ
      { serverId: server.id, categoryId: voz.id, name: 'menu-de-creador', emoji: '⚙️', position: 0 },
      { serverId: server.id, categoryId: voz.id, name: 'Crear canal', emoji: '🔊', position: 1, type: 'voice' },

      // TEXTO
      { serverId: server.id, categoryId: texto.id, name: 'bienvenida', emoji: '👋', position: 0 },
      { serverId: server.id, categoryId: texto.id, name: 'plaza-publica', emoji: '👥', position: 1, type: 'forum' },
      { serverId: server.id, categoryId: texto.id, name: 'meme-pool', emoji: '🤡', position: 2 },
      { serverId: server.id, categoryId: texto.id, name: 'embassy', emoji: '🇪', position: 3 },
      { serverId: server.id, categoryId: texto.id, name: 'niveles-y-cumple', emoji: '🏆', position: 4 },
      { serverId: server.id, categoryId: texto.id, name: 'purgatorio', emoji: '💀', position: 5 },

      // TECH
      { serverId: server.id, categoryId: tech.id, name: 'bitcoin-tech', emoji: '🟠', position: 0, type: 'forum' },
      { serverId: server.id, categoryId: tech.id, name: 'nostr', emoji: '🐔', position: 1 },
      { serverId: server.id, categoryId: tech.id, name: 'la-wallet', emoji: '⚙️', position: 2, type: 'forum' },
    ],
  });

  // ── Forum Tags ──
  const forumChannels = await prisma.channel.findMany({
    where: { serverId: server.id, type: 'forum' },
  });

  for (const ch of forumChannels) {
    const tags = ch.name === 'plaza-publica'
      ? [
          { name: 'Debate', color: '#ef4444', position: 0 },
          { name: 'Pregunta', color: '#3b82f6', position: 1 },
          { name: 'Noticia', color: '#f59e0b', position: 2 },
          { name: 'Meme', color: '#a855f7', position: 3 },
          { name: 'Off-topic', color: '#6b7280', position: 4 },
        ]
      : ch.name === 'bitcoin-tech'
      ? [
          { name: 'Lightning', color: '#f59e0b', position: 0 },
          { name: 'On-chain', color: '#f97316', position: 1 },
          { name: 'Mining', color: '#6b7280', position: 2 },
          { name: 'Seguridad', color: '#ef4444', position: 3 },
          { name: 'Tutorial', color: '#22c55e', position: 4 },
        ]
      : [
          { name: 'Bug', color: '#ef4444', position: 0 },
          { name: 'Feature', color: '#3b82f6', position: 1 },
          { name: 'Ayuda', color: '#f59e0b', position: 2 },
        ];

    await prisma.forumTag.createMany({
      data: tags.map((t) => ({ channelId: ch.id, ...t })),
    });
  }

  console.log('Seeded La Crypta server with categories, channels, and forum tags');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
