# Nostcord — Discord-like App with Nostr Identity

## Premisa

Los DMs en Nostr están verdes:
- **NIP-04:** Encripta el contenido pero expone los metadatos (quién habla con quién)
- **NIP-17:** Usa keypairs desechables para ocultar metadatos, pero es muy propenso al spam
- **Conclusión:** No tiene sentido construir toda la lógica de canales, mensajes privados y permisos puramente sobre Nostr. Mejor usar un servidor (en La Crypta o donde sea) para la lógica de canales, y Nostr para lo que sí hace bien: **identidad y autenticación**.

## Arquitectura

```
┌─────────────────────────────────────────────┐
│                  Frontend                    │
│         Next.js + Tailwind (La Crypta UI)   │
├─────────────────────────────────────────────┤
│               Auth Layer                     │
│    Nostr (NIP-07 / nsec / NIP-46 bunker)    │
├─────────────────────────────────────────────┤
│              Backend / API                   │
│         Next.js API Routes + WebSockets      │
├─────────────────────────────────────────────┤
│               Base de Datos                  │
│     SQLite / PostgreSQL (canales, msgs)      │
└─────────────────────────────────────────────┘
```

**Nostr maneja:** Autenticación (sign-in con claves) + DMs (encriptados via relays, NIP-04/NIP-17, usando el signer del usuario)
**El servidor maneja:** TODO lo demás — perfiles de app, canales, mensajes, media, permisos, roles, tiempo real. Self-hosted por el host del servidor.

## Roadmap

### Fase 0 — Fundación (lo que ya existe)
- [x] Login con NIP-07, nsec, NIP-46
- [x] Perfil de Nostr (avatar, banner, bio, NIP-05)
- [x] Design system La Crypta
- [x] Relay management

### Fase 0.5 — Landing Page
- [ ] Landing page con branding del proyecto
- [ ] i18n (ES/EN) — todo el sitio bilingüe
- [ ] Secciones: hero, features, how it works, CTA (login/register)
- [ ] Design badass — dark theme, animaciones, glows, glassmorphism, La Crypta aesthetic
- [ ] Responsive (mobile/desktop)

### Fase 1 — Auth + Chat Básico (single server)
> Scope: UN solo servidor (host). No multi-server todavía.
> Auth: Nostr sign-in. Anti-spam para después (invites, whitelist, etc).

- [ ] Auth con firma Nostr (challenge → sign → verify → JWT/session)
- [ ] Modelo de datos: servidor (single), canales, mensajes, miembros
- [ ] API Routes para CRUD de canales y mensajes
- [ ] WebSocket server para mensajes en tiempo real
- [ ] UI estilo Discord: sidebar canales, chat area, message input
- [ ] Threads (respuestas a mensajes, como Discord)
- [ ] Multimedia en mensajes (imágenes, links con preview)
- [ ] Persistencia en SQLite (desarrollo) / PostgreSQL (producción)

### Fase 2 — Funcionalidades Core
- [ ] Canales de texto con historial y scroll infinito
- [ ] Canales de voz (via [HiveTalk SFU](https://github.com/HiveTalk/hivetalksfu) — WebRTC SFU self-hosted)
- [ ] Roles y permisos (admin, mod, miembro)
- [ ] Sistema de invitaciones (links de un uso / por npub) — anti-spam
- [ ] Indicador de "escribiendo..."
- [ ] Menciones (@usuario) resueltas desde Nostr profiles
- [ ] Reacciones a mensajes (emoji)
- [ ] Multi-server (crear/unirse a varios servidores)
- [ ] DMs via Nostr relays (encrypt/decrypt con el signer del usuario, NIP-04/NIP-17)

### Fase 3 — Features Avanzados
- [ ] Perfiles de app (avatar, bio, display name — datos propios, no de Nostr)
- [ ] Exportar conversaciones (JSON / texto plano)
- [ ] Bots / integraciones
- [ ] Búsqueda de mensajes
- [ ] Upload de archivos/media (almacenado en el servidor del host)

### Fase 4 — Polish & Launch
- [ ] Notificaciones (push / in-app)
- [ ] Temas personalizados por servidor
- [ ] Mobile responsive
- [ ] Deploy a producción

### Test Suite (continuo, se construye junto con cada fase)
> No mocks. Tests reales contra infraestructura real.

- [ ] Setup: Vitest/Jest + Playwright (e2e) + test DB (SQLite en memoria)
- [ ] **Auth tests:** Login real con nsec/npub generados, firma de challenges, verificación de sesión, logout, sesiones expiradas
- [ ] **Channel tests:** CRUD canales, permisos, orden, canales vacíos/llenos
- [ ] **Message tests:** Envío, recepción via WebSocket, threads, historial, paginación
- [ ] **Multimedia tests:** Upload, preview, límites de tamaño, tipos permitidos
- [ ] **DM tests:** Encrypt/decrypt real con keypairs de test via relays de test
- [ ] **WebSocket tests:** Conexión, reconexión, múltiples clientes simultáneos, broadcast
- [ ] **Members tests:** Join, leave, roles, permisos por rol
- [ ] **E2E flows:** Usuario se registra → entra a canal → manda mensaje → otro usuario lo ve → thread → respuesta
- [ ] **Load tests:** Múltiples usuarios concurrentes, flood de mensajes
- [ ] **i18n tests:** Todas las strings en ES y EN presentes y correctas
- [ ] CI pipeline: tests corren en cada PR

### Fase 5 — Knowledge Base con LLM
- [ ] LLM local/pequeño indexando contenido de canales y threads
- [ ] Genera descripciones/resúmenes de conversaciones
- [ ] Sugiere threads existentes relevantes cuando alguien pregunta algo ya discutido
- [ ] Recomienda crear nuevos threads cuando detecta un tema nuevo en el chat general
- [ ] Las descripciones/índices se aprueban por un mod antes de indexarse
- [ ] Búsqueda semántica sobre la knowledge base indexada

## Auth Flow (Nostr-based)

```
1. Cliente pide login
2. Servidor genera challenge (random string + timestamp)
3. Cliente firma el challenge con su clave Nostr (NIP-07 / nsec / bunker)
4. Servidor verifica la firma contra la pubkey
5. Servidor emite JWT/session token
6. Todas las requests usan ese token
```

## Modelo de Datos (v1)

```
Server
├── id, name, icon, owner_pubkey, created_at
├── channels[]
└── members[]

Channel
├── id, server_id, name, type (text/voice), position
└── messages[]

Message
├── id, channel_id, author_pubkey, content, created_at
├── reactions[]
└── reply_to (nullable)

Member
├── server_id, pubkey, role, joined_at
└── nostr_profile (cached from kind 0)
```

## Stack Técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 16 + TypeScript + Tailwind v4 |
| Auth | Nostr (NDK + nostr-tools) |
| API | Next.js API Routes |
| Realtime | WebSockets (socket.io o ws) |
| DB | SQLite (dev) → PostgreSQL (prod) |
| ORM | Drizzle o Prisma |
| Perfiles | Cacheados desde Nostr (kind 0) |
| Deploy | Vercel + PlanetScale/Neon (o self-hosted) |

## Por qué esto gana el hackathon

1. **Resuelve un problema real** — La Crypta usa Discord, pero su identidad está en Nostr
2. **Identity innovation** — Nostr keys como identidad universal, badges como roles, NIP-05 como verificación
3. **Demo impactante** — Un chat en tiempo real siempre impresiona
4. **Pragmático** — No fuerza todo sobre Nostr, usa cada tecnología donde tiene sentido
5. **Extensible** — La base permite agregar voz, video, bots, bridges a Nostr relays
