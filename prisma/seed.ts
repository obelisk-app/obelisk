import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({ url: 'file:./dev.db' });
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
      ownerPubkey: 'system',
    },
  });

  // ── Categories matching Discord screenshots ──

  const oficial = await prisma.category.create({
    data: { serverId: server.id, name: 'OFICIAL', position: 0 },
  });

  const merito = await prisma.category.create({
    data: { serverId: server.id, name: 'MÉRITO', position: 1 },
  });

  const texto = await prisma.category.create({
    data: { serverId: server.id, name: 'TEXTO', position: 2 },
  });

  const tech = await prisma.category.create({
    data: { serverId: server.id, name: 'TECH', position: 3 },
  });

  // ── Channels ──

  await prisma.channel.createMany({
    data: [
      // Pinned (no category)
      { serverId: server.id, categoryId: null, name: 'chat-general', emoji: '💬', position: 0 },

      // OFICIAL
      { serverId: server.id, categoryId: oficial.id, name: 'empezá-acá', emoji: '📌', position: 0 },
      { serverId: server.id, categoryId: oficial.id, name: 'indice', emoji: '📜', position: 1, type: 'voice' },
      { serverId: server.id, categoryId: oficial.id, name: 'anuncios', emoji: '🏆', position: 2, type: 'voice' },
      { serverId: server.id, categoryId: oficial.id, name: 'méritos', emoji: '🏅', position: 3, type: 'voice' },
      { serverId: server.id, categoryId: oficial.id, name: 'las-3-cosas', emoji: '3️⃣', position: 4 },

      // MÉRITO
      { serverId: server.id, categoryId: merito.id, name: 'plata', emoji: '🥈', position: 0 },
      { serverId: server.id, categoryId: merito.id, name: 'acero', emoji: '🎖️', position: 1 },

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

  console.log('Seeded La Crypta server with categories and channels');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
