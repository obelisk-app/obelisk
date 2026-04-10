import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const SYSTEM_PUBKEY = '0000000000000000000000000000000000000000000000000000000000000000';
const OWNER_PUBKEY = 'd9590d95a7811e1cb312be66edd664d7e3e6ed57822ad9f213ed620fc6748be8';

async function main() {
  // ── Upsert server (preserves existing data) ──
  let server = await prisma.server.findFirst({ where: { name: 'La Crypta' } });
  if (!server) {
    server = await prisma.server.create({
      data: {
        name: 'La Crypta',
        icon: '/lacrypta-logo.png',
        banner: '/lacrypta-banner.png',
        ownerPubkey: OWNER_PUBKEY,
      },
    });
    console.log('Created server: La Crypta');
  } else {
    console.log('Server already exists: La Crypta');
  }

  // ── Upsert Categories ──
  const categoryDefs = [
    { name: 'OFICIAL', position: 0 },
    { name: 'MÉRITO', position: 1 },
    { name: 'VOZ', position: 2 },
    { name: 'TEXTO', position: 3 },
    { name: 'TECH', position: 4 },
  ];

  const categories: Record<string, string> = {};
  for (const cat of categoryDefs) {
    const existing = await prisma.category.findFirst({
      where: { serverId: server.id, name: cat.name },
    });
    if (existing) {
      categories[cat.name] = existing.id;
    } else {
      const created = await prisma.category.create({
        data: { serverId: server.id, name: cat.name, position: cat.position },
      });
      categories[cat.name] = created.id;
    }
  }
  console.log('Categories ready');

  // ── Upsert Channels ──
  const channelDefs = [
    // Pinned (no category)
    { categoryId: null, name: 'chat-general', emoji: '💬', position: 0, type: 'text' },

    // OFICIAL
    { categoryId: categories['OFICIAL'], name: 'empezá-acá', emoji: '📌', position: 0, type: 'text' },
    { categoryId: categories['OFICIAL'], name: 'indice', emoji: '📜', position: 1, type: 'forum' },
    { categoryId: categories['OFICIAL'], name: 'anuncios', emoji: '🏆', position: 2, type: 'text' },
    { categoryId: categories['OFICIAL'], name: 'méritos', emoji: '🏅', position: 3, type: 'forum' },
    { categoryId: categories['OFICIAL'], name: 'las-3-cosas', emoji: '3️⃣', position: 4, type: 'text' },

    // MÉRITO
    { categoryId: categories['MÉRITO'], name: 'plata', emoji: '🥈', position: 0, type: 'text' },
    { categoryId: categories['MÉRITO'], name: 'acero', emoji: '🎖️', position: 1, type: 'text' },

    // VOZ
    { categoryId: categories['VOZ'], name: 'Canal de Voz', emoji: '🔊', position: 0, type: 'voice' },

    // TEXTO
    { categoryId: categories['TEXTO'], name: 'bienvenida', emoji: '👋', position: 0, type: 'text' },
    { categoryId: categories['TEXTO'], name: 'plaza-publica', emoji: '👥', position: 1, type: 'forum' },
    { categoryId: categories['TEXTO'], name: 'meme-pool', emoji: '🤡', position: 2, type: 'text' },
    { categoryId: categories['TEXTO'], name: 'embassy', emoji: '🇪', position: 3, type: 'text' },
    { categoryId: categories['TEXTO'], name: 'niveles-y-cumple', emoji: '🏆', position: 4, type: 'text' },
    { categoryId: categories['TEXTO'], name: 'purgatorio', emoji: '💀', position: 5, type: 'text' },

    // TECH
    { categoryId: categories['TECH'], name: 'bitcoin-tech', emoji: '🟠', position: 0, type: 'forum' },
    { categoryId: categories['TECH'], name: 'nostr', emoji: '🐔', position: 1, type: 'text' },
    { categoryId: categories['TECH'], name: 'la-wallet', emoji: '⚙️', position: 2, type: 'forum' },
  ];

  const channels: Record<string, string> = {};
  for (const ch of channelDefs) {
    const existing = await prisma.channel.findFirst({
      where: { serverId: server.id, name: ch.name },
    });
    if (existing) {
      // Update type if changed (e.g. text -> forum)
      if (existing.type !== ch.type) {
        await prisma.channel.update({
          where: { id: existing.id },
          data: { type: ch.type },
        });
      }
      channels[ch.name] = existing.id;
    } else {
      const created = await prisma.channel.create({
        data: {
          serverId: server.id,
          categoryId: ch.categoryId,
          name: ch.name,
          emoji: ch.emoji,
          position: ch.position,
          type: ch.type,
        },
      });
      channels[ch.name] = created.id;
    }
  }
  console.log('Channels ready');

  // ── Forum Tags (upsert) ──
  const forumTagDefs: Record<string, { name: string; color: string; position: number }[]> = {
    'plaza-publica': [
      { name: 'Debate', color: '#ef4444', position: 0 },
      { name: 'Pregunta', color: '#3b82f6', position: 1 },
      { name: 'Noticia', color: '#f59e0b', position: 2 },
      { name: 'Meme', color: '#a855f7', position: 3 },
      { name: 'Off-topic', color: '#6b7280', position: 4 },
    ],
    'bitcoin-tech': [
      { name: 'Lightning', color: '#f59e0b', position: 0 },
      { name: 'On-chain', color: '#f97316', position: 1 },
      { name: 'Mining', color: '#6b7280', position: 2 },
      { name: 'Seguridad', color: '#ef4444', position: 3 },
      { name: 'Tutorial', color: '#22c55e', position: 4 },
    ],
    'la-wallet': [
      { name: 'Bug', color: '#ef4444', position: 0 },
      { name: 'Feature', color: '#3b82f6', position: 1 },
      { name: 'Ayuda', color: '#f59e0b', position: 2 },
    ],
    'indice': [
      { name: 'Info', color: '#3b82f6', position: 0 },
      { name: 'Reglas', color: '#ef4444', position: 1 },
      { name: 'Recursos', color: '#22c55e', position: 2 },
    ],
    'méritos': [
      { name: 'Reclamo', color: '#f59e0b', position: 0 },
      { name: 'Info', color: '#3b82f6', position: 1 },
    ],
  };

  for (const [chName, tags] of Object.entries(forumTagDefs)) {
    const channelId = channels[chName];
    if (!channelId) continue;
    for (const tag of tags) {
      const existing = await prisma.forumTag.findFirst({
        where: { channelId, name: tag.name },
      });
      if (!existing) {
        await prisma.forumTag.create({
          data: { channelId, ...tag },
        });
      }
    }
  }
  console.log('Forum tags ready');

  // ── Seed content: empezá-acá welcome message ──
  const empezaId = channels['empezá-acá'];
  if (empezaId) {
    const hasMessages = await prisma.message.findFirst({ where: { channelId: empezaId } });
    if (!hasMessages) {
      await prisma.message.create({
        data: {
          channelId: empezaId,
          authorPubkey: SYSTEM_PUBKEY,
          content: `# Te damos la bienvenida a La Crypta

**Este es el comienzo de este servidor.**

---

**Bienvenid@ a La Crypta**

• Somos una comunidad dedicada a la **educación** y **difusión** del ecosistema **Bitcoin** y herramientas que brindan **independencia** y **autonomía** a los individuos.
• Nos enfocamos en proporcionar información **valiosa** y **organizar** eventos para fomentar el aprendizaje y la discusión sobre estos temas.

1️⃣ Te invitamos a enviar tu primer mensaje en 💬 **#chat-general**
2️⃣ Visitá el 📜 **#indice** para conocer mas sobre el servidor.

¡Muchas gracias por unirte! Te esperamos en los canales para charlar.`,
        },
      });
      console.log('Seeded empezá-acá welcome message');
    }
  }

  // ── Seed content: indice forum posts ──
  const indiceId = channels['indice'];
  if (indiceId) {
    const hasMessages = await prisma.message.findFirst({ where: { channelId: indiceId } });
    if (!hasMessages) {
      const indicePosts = [
        {
          title: 'Los 7 valores',
          content: '🧡 **Honestidad:** sinceridad y transparencia en todo momento. 💚',
          tagName: 'Info',
        },
        {
          title: 'Actividades',
          content: '🏢 Coworking todos los Martes 12hs, en EL TEMPLO de La Crypta, Villanueva 1367, Belgrano, CABA. Sacá tu ticket en nuestras redes.',
          tagName: 'Info',
        },
        {
          title: 'Nuestros proyectos',
          content: '🅿️ Conocé nuestros proyectos en https://lacrypta.ar',
          tagName: 'Recursos',
        },
        {
          title: 'Reglas',
          content: '1️⃣ Sos bienvenido/a a participar en todos los canales\n2️⃣ Respeto ante todo. Somos compañeros y valoramos la buena onda.',
          tagName: 'Reglas',
        },
        {
          title: 'Redes',
          content: '🌐 [Web](https://lacrypta.ar/) ✖ [Twitter](https://twitter.com/LaCryptaOk) 📷 [Instagram](https://instagram.com/lacryptaok)',
          tagName: 'Recursos',
        },
      ];

      for (const post of indicePosts) {
        const msg = await prisma.message.create({
          data: {
            channelId: indiceId,
            authorPubkey: OWNER_PUBKEY,
            title: post.title,
            content: post.content,
          },
        });

        // Attach forum tag
        const tag = await prisma.forumTag.findFirst({
          where: { channelId: indiceId, name: post.tagName },
        });
        if (tag) {
          await prisma.forumTagOnMessage.create({
            data: { messageId: msg.id, tagId: tag.id },
          });
        }
      }
      console.log('Seeded indice forum posts');
    }
  }

  // ── Seed content: méritos forum posts ──
  const meritosId = channels['méritos'];
  if (meritosId) {
    const hasMessages = await prisma.message.findFirst({ where: { channelId: meritosId } });
    if (!hasMessages) {
      const meritosPosts = [
        {
          title: 'las-3-cosas',
          content: '🏅 Mérito de Bronce 🟢 Queremos conocer a ustedes y ver como podemos hacer sinergia preparandonos para el futuro.',
          tagName: 'Info',
        },
        {
          title: 'reclamá-el-plata',
          content: '🥈 🟢 PLANTILLA PARA RECLAMAR EL PLATA 🥈 — Condiciones: Haber estado 1 vez en el ranking Top 10 Trimestral.',
          tagName: 'Reclamo',
        },
        {
          title: 'reclamá-el-oro',
          content: '[PRÓXIMAMENTE...]',
          tagName: 'Reclamo',
        },
        {
          title: 'reclamá-el-acero',
          content: '🎖️ 🟢 PLANTILLA PARA RECLAMAR EL ACERO 🥈 — Condiciones: Tres miembros con el Mérito de Plata deben recomendarte.',
          tagName: 'Reclamo',
        },
      ];

      for (const post of meritosPosts) {
        const msg = await prisma.message.create({
          data: {
            channelId: meritosId,
            authorPubkey: OWNER_PUBKEY,
            title: post.title,
            content: post.content,
          },
        });

        const tag = await prisma.forumTag.findFirst({
          where: { channelId: meritosId, name: post.tagName },
        });
        if (tag) {
          await prisma.forumTagOnMessage.create({
            data: { messageId: msg.id, tagId: tag.id },
          });
        }
      }
      console.log('Seeded méritos forum posts');
    }
  }

  // ── Ensure system member exists (for welcome messages) ──
  const systemMember = await prisma.member.findFirst({
    where: { serverId: server.id, pubkey: SYSTEM_PUBKEY },
  });
  if (!systemMember) {
    await prisma.member.create({
      data: {
        serverId: server.id,
        pubkey: SYSTEM_PUBKEY,
        role: 'admin',
        displayName: 'La Crypta',
        picture: '/lacrypta-logo.png',
      },
    });
    console.log('Created system member for welcome messages');
  }

  console.log('Seed complete — all data preserved');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
