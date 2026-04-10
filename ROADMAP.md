# Obelisk — Roadmap

## Fase 0 — Fundacion (lo que ya existe)
- [x] Login con NIP-07, nsec, NIP-46
- [x] Perfil de Nostr (avatar, banner, bio, NIP-05)
- [x] Design system La Crypta
- [x] Relay management

## Fase 0.5 — Landing Page
- [x] Landing page con branding del proyecto
- [x] i18n (ES/EN) — todo el sitio bilingue
- [x] Secciones: hero, features, how it works, CTA (login/register)
- [x] Design badass — dark theme, animaciones, glows, glassmorphism, La Crypta aesthetic
- [x] Responsive (mobile/desktop)

## ⚡ PRIORIDAD — Cache de perfiles Nostr
> Los perfiles (avatar, nombre, NIP-05) se traen de relays en cada render. Hay que cachearlos localmente.

- [x] Al hacer login, guardar perfil completo en DB (avatar, displayName, banner, about, nip05)
- [x] Servir perfiles desde DB en vez de consultar relays en cada request
- [x] Job periodico (1x/dia) que actualiza todos los perfiles cacheados desde relays
- [x] Backfill de perfiles de usuarios anteriores al startup
- [x] Boton "Sincronizar desde Nostr" en panel de perfil del usuario
- [x] Nickname local por servidor (override del nombre Nostr dentro de Obelisk)

## Fase 1 — Auth + Chat Basico (single server)
> Scope: UN solo servidor (host). No multi-server todavia.

- [x] Auth con firma Nostr (challenge -> sign -> verify -> session)
- [x] Modelo de datos: servidor, canales, categorias, mensajes, miembros, bans, mutes, warnings, reports
- [x] API Routes para CRUD de canales y mensajes
- [x] WebSocket server para mensajes en tiempo real
- [x] UI estilo Discord: sidebar canales con categorias, chat area, message input
- [x] Threads (respuestas a mensajes)
- [x] Multimedia en mensajes (imagenes inline, links)
- [x] Persistencia en PostgreSQL (Neon via Vercel)
- [x] Reacciones a mensajes (emoji)
- [x] Edicion de mensajes

## Fase 1.5 — Admin, Moderacion & Foros
> ⚠️ **URGENTE:** El panel de admin necesita mejoras criticas — no se pueden eliminar servidores creados.
- [x] Rediseñar panel de admin (/admin) para multi-server — ver [docs/multi-server-admin.md](docs/multi-server-admin.md)
  - [x] Selector de servidor — cada server tiene su propia config (ServerPicker dropdown)
  - [x] CRUD de canales y categorias por servidor (server-scoped via query/resource)
  - [x] Gestion de miembros, bans, configuracion por servidor
  - [x] **Instance owner** (env: `INSTANCE_OWNER_PUBKEY`) — acceso global a todos los servers, transferencia de `Server.ownerPubkey` desde Settings
  - [x] **Crear servidores desde /admin** — boton "+ New Server" en el ServerPicker (instance owner only)
  - [x] **Editor de membresias cross-server** — instance owner puede agregar/remover usuarios de cualquier server desde el row de un miembro
  - [x] **Tracking de invite source** — Member.joinedViaInviteId, badge "via invite" en el panel admin, dedupe + ban reason en /api/invitations/[code]
  - [x] **Reconciliación joinMode vs WoT** — Access Control tab unifica join-mode selector + WoT + invitations en una sola sección coherente; Settings ya no duplica controles de acceso
  - [ ] **Wizard de setup inicial / instance owner desde UI** — actualmente `INSTANCE_OWNER_PUBKEY` se hardcodea en `.env.production` y los operadores tienen que editar el archivo manualmente. Para mejorar el self-hosting, agregar un flow de setup en la primera visita: si no hay instance owner configurado, el primer usuario que loguee con NIP-07 puede claim el instance owner role, persistido en DB (nueva tabla `Instance` o columna en `Server`). Permite editar después desde un panel especial /admin/instance.
  - [ ] **Seccion "Acceso al servidor"** en /admin (por servidor):
    - [ ] Input para setear el **npub referente** del servidor — preview del perfil Nostr + conteo de seguidos
    - [ ] Boton "Refrescar WoT" que re-fetchea el kind 3 del referente desde relays
    - [ ] Lista de npubs auto-autorizados (los que el referente sigue) con busqueda
    - [ ] **Generador de invite links** — boton "Crear invite", copia al portapapeles, muestra URL, expiracion, max usos
    - [ ] Tabla de invites activos por servidor: link, creado por, usos/max, expira, estado, accion revocar
    - [ ] Override manual: admin puede whitelistear un npub que no esta en la WoT
  - [ ] Config de umbrales para que usuarios comunes desbloqueen invites (dias activos, mensajes minimos, invites por usuario)
- [ ] Sistema de roles y permisos por servidor
  - [x] Roles (owner/admin/mod/member) por servidor — instance owner global
  - [x] Asignar roles por servidor (mod en server A, member en server B) — schema soporta, /admin permite cambiar role
  - [ ] Permisos configurables por rol (que puede hacer cada rol en cada servidor)
  - [ ] Roles custom para acceso a servidores (ej: rol "VIP" da acceso a server privado)
  - [ ] Control de acceso por rol — quien puede ver/unirse a cada servidor
- [ ] Rediseñar panel de moderacion (/moderation) para multi-server
  - [ ] Reportes, mutes, warnings, audit log scoped por servidor
  - [ ] Mods solo ven/actuan en servidores donde tienen permisos
- [x] Formularios de mute y warn en la UI de moderacion
- [x] Razon de ban requerida via BanReasonDialog
- [x] Audit log con paginacion y report resolution logging
- [x] Enforcement de mute en REST + Socket
- [x] Role guard en creacion de canales (admin+)
- [x] Canales tipo foro (posts con titulo + thread de respuestas)
- [x] ForumView con lista de posts, vista detalle, y respuestas
- [x] Paginacion de mensajes (load earlier messages)
- [x] Indicador de "escribiendo..."
- [x] Manejo de errores de socket (message-error)
- [x] Tests: 146+ tests cubriendo stores, componentes, y API routes

## Fase 2 — Funcionalidades Core
- [x] Canales de voz — audio (via mediasoup WebRTC SFU)
- [x] Canales de voz — video y screen sharing
- [ ] Canales de voz — chat dentro del canal de voz
- [ ] **WoT — Registro automatico via Web of Trust** (feature core anti-spam) — ver [docs/wot-and-invite-credits.md](docs/wot-and-invite-credits.md)
  - [ ] Cada servidor define una cuenta "referente" (npub) — ej: La Crypta para el server de La Crypta
  - [ ] Cualquier npub seguido por el referente puede registrarse automaticamente en ese servidor
  - [ ] Fetch del kind 3 (contact list) del referente desde relays, cache en DB con refresh periodico
  - [ ] Endpoint `/api/servers/:id/wot-check` — verifica si un npub esta en la WoT del referente
  - [ ] Flujo de registro: login -> chequeo WoT -> acceso directo sin invite si hay match
  - [ ] Config del referente desde /admin (por servidor)
- ~~**Sistema de invitaciones desbloqueable por actividad**~~ — **descartado**.
  El feature de invite credits fue removido en su totalidad: la UI de admin
  (form de policy en `AccessPanel`), el endpoint `/api/servers/:id/invite-credits`,
  el helper `lib/invite-credits.ts`, el `InviteCreditsCard` del perfil, y el
  enforcement en `POST /api/servers/:id/invitations`. Ahora **solo admins+
  pueden crear invites** (modelo Discord). Las columnas `minDaysActive`,
  `minMessages`, `invitesPerUser`, `inviteExpiryHours` siguen en `Server`
  para no perder data, pero no se leen ni escriben.
  - [x] Tracking de invite source — `Member.joinedViaInviteId` + lista de
    miembros que entraron por cada link en el InviteManager
  - [x] Lista de invites activos por servidor con dedupe (already-member
    no consume usos) y razón de ban en respuestas 403
- [x] Menciones (@usuario) resueltas desde Nostr profiles
- [x] Renderizado de texto enriquecido en mensajes
  - [x] Markdown: bold, italic, strikethrough, inline code, code blocks con syntax highlighting
  - [x] Blockquotes y listas
  - [x] Spoiler tags (||texto oculto||)
  - [x] Link previews (OG metadata: titulo, descripcion, imagen, favicon)
  - [x] Embeds de video (YouTube)
- [ ] Mejoras a posts de foro (estilo Discord publicaciones)
  > **Contexto tecnico:** los posts de foro son sub-chats creados por usuarios — cada post es su propio chat, no un thread de respuestas planas. Hoy `ForumView.tsx` reimplementa el chat con un textarea + REST puro, sin Socket.io, sin reusar `MessageArea`/`MessageInput`. Por eso le faltan features que el chat regular ya tiene. La fix correcta es **reusar los mismos componentes** del chat regular dentro de la vista detalle del post, no re-implementarlos.
  - **Refactor base (paridad arquitectonica):**
    - [ ] Vista detalle del post usa `MessageArea` + `MessageInput` (los mismos del chat regular) en vez de los custom de `ForumView.tsx`
    - [ ] Replies de posts viajan por Socket.io (no REST), reusando los mismos handlers de `message:new`, `message:edit`, `message:delete`, `message:reaction`
    - [ ] API de replies devuelve el mismo shape que mensajes regulares (incluir `reactions`, `editedAt`, `deletedAt`, `replyTo`, autor completo) — el schema ya lo soporta
  - **Paridad de features con el chat regular** (todo lo de abajo debe funcionar dentro de un post igual que en un canal de texto):
    - [ ] Menciones (@usuario) con autocomplete y resolucion desde Nostr profiles
    - [ ] Reacciones con emoji
    - [ ] Edicion de mensajes (autor) y borrado (autor + mods)
    - [ ] Reply / quote dentro del post-chat
    - [ ] Indicador de "escribiendo..."
    - [ ] Paginacion de respuestas (load earlier)
    - [ ] Multimedia inline (imagenes, links, embeds, YouTube — ya parcialmente via `MessageContent`)
    - [ ] Busqueda de mensajes dentro del post-chat
  - **Estructura tipo Discord forum:**
    - [ ] Vista de lista: titulo, autor, preview, imagen thumbnail, tags, conteo de reacciones/respuestas
    - [ ] Vista detalle: post completo + chat de respuestas reusando `MessageArea`/`MessageInput`
    - [ ] Imagen de portada para posts
    - [ ] Tags por post + filtros y ordenamiento
    - [ ] Barra de busqueda dentro del canal de foro
  - **Permisos y gestion:**
    - [ ] El creador del post puede editar su contenido
    - [ ] Moderadores pueden editar/eliminar cualquier post
    - [ ] Pin de posts (mods/admin)
    - [ ] Gestion de posts desde /admin (editar, eliminar, pin, gestionar tags)
- [ ] **Canales/posts bloqueados (write-locked) — solo admins/mods pueden escribir o editar**
  - [ ] Flag `writeLocked` (o `writeRole: "everyone" | "mod" | "admin"`) en `Channel` — y equivalente para posts de foro individuales
  - [ ] Enforcement en backend: REST + Socket.io rechazan `message:new` / `message:edit` / `message:delete` si el usuario no cumple el rol requerido en el canal/post bloqueado
  - [ ] UI: input deshabilitado con tooltip "Solo mods/admins pueden escribir aqui" para usuarios sin permiso
  - [ ] Indicador visual en sidebar/lista (icono de candado) para canales y posts bloqueados
  - [ ] Toggle en /admin → ChannelManager: por canal, elegir quien puede escribir (everyone / mod / admin)
  - [ ] Toggle por post de foro: el autor o un mod puede bloquear su propio post (read-only para el resto)
  - [ ] Reusar el mismo permission check que `auth-roles.ts` ya expone para acciones admin
  - [ ] Tests: REST + Socket rechazan writes sin permiso, UI deshabilita input, /admin persiste cambios
- [ ] Canales de anuncios (solo admins/mods pueden postear, miembros solo lectura) — caso particular del flag `writeLocked` de arriba
- [x] Canal de bienvenida — mensaje automatico con banner personalizado cuando un miembro se une
- [ ] Idioma canonico del servidor
  - [ ] Campo `language` en Server (ej: "es", "en", "pt") — configurable desde /admin
  - [ ] Mensajes del sistema (bienvenida, avisos de moderacion, placeholders) usan el idioma del servidor
  - [ ] UI del chat respeta el idioma del servidor (labels, tooltips, timestamps locale)
  - [ ] El idioma del servidor es independiente del idioma de la landing (i18n del sitio)
  - [ ] Selector de idioma en la configuracion del servidor (admin)
  - [ ] Fallback a "es" si no se configura
- [ ] Multi-server (crear/unirse a varios servidores)
- [x] DMs via Nostr relays (encrypt/decrypt con el signer del usuario, NIP-04/NIP-17)
- [ ] Eliminacion de cuenta y datos del usuario
  - [ ] Opcion en settings/perfil para eliminar cuenta
  - [ ] Eliminar todos los mensajes del usuario (o reemplazar con "[mensaje eliminado]")
  - [ ] Eliminar membresías, sesiones, bans, mutes, warnings y reports asociados
  - [ ] Confirmacion explicita antes de proceder (accion irreversible)
  - [ ] API endpoint protegido (solo el propio usuario puede eliminar su cuenta)

## Fase 3 — Features Avanzados
- [ ] Perfiles de app (avatar, bio, display name — datos propios, no de Nostr)
- [ ] Edicion de perfil Nostr desde Obelisk (publicar kind 0 a relays)
  > ⚠️ **CUIDADO:** Publicar un kind 0 (metadata) sobreescribe TODA la metadata del usuario en los relays. Antes de implementar: (1) siempre leer el kind 0 actual del usuario, (2) mergear solo los campos editados, (3) mostrar preview/diff antes de publicar, (4) pedir confirmacion explicita, (5) nunca enviar campos vacios que borren datos existentes. Un campo mal enviado puede destruir avatar, bio, NIP-05 del usuario en todo Nostr.
- [ ] Exportar conversaciones (JSON / texto plano)
- [ ] Bots / integraciones
- [x] Busqueda de mensajes (Discord-style: from:, in:, has:, before:, after:, mentions:, "exact phrases")
- [ ] Upload de archivos/media
  - [ ] Drag & drop y boton de adjuntar en el message input
  - [ ] Preview inline de imagenes, videos y audio
  - [ ] Soporte para archivos genericos (PDF, ZIP, etc.) con icono y descarga
  - [ ] Limites configurables de tamaño por servidor
  - [ ] Almacenamiento en el servidor del host (no depende de servicios externos)

## Fase 4 — Polish & Launch
- [ ] PWA (Progressive Web App) — installable, offline support, service worker
- [ ] Notificaciones (push / in-app)
- [ ] Temas personalizados por servidor
- [ ] Mejorar experiencia mobile
  - [ ] Elementos que se ocultan o quedan inaccesibles en pantallas chicas
  - [ ] Pantallas que no respetan el tamaño del viewport (scroll roto, overflow)
  - [ ] Revisar todas las vistas: chat, admin, moderacion, voice, foros
- [x] Deploy a produccion (Vercel + Neon Postgres)
- [ ] Restaurar real-time (Socket.io en Railway/Fly.io, o migrar a Pusher/Ably)

## Fase 5 — Knowledge Base con LLM
> Documentacion completa: [docs/llm-knowledge-base.md](docs/llm-knowledge-base.md)

### Conversation Detection & Topic Routing
- [ ] Detector de conversaciones: cuando N mensajes entre un subgrupo de usuarios ocurren dentro de una ventana de tiempo configurable, se activa el sistema
- [ ] El detector analiza patrones: replies directos, mensajes consecutivos del mismo grupo, @menciones entre participantes
- [ ] Si hay match con thread existente → sugiere mover la conversacion ahi (inline card no intrusiva)
- [ ] Si no hay match → recomienda crear un nuevo topic con titulo sugerido
- [ ] Sugerencias aparecen como cards inline (similar a typing indicator), cada usuario puede dismissearla
- [ ] Cooldown configurable para no spamear sugerencias en el mismo canal

### Thread Index (Knowledge Base)
- [ ] Todos los threads y forum posts se indexan con: id, titulo, descripcion generada por LLM, tags
- [ ] LLM (`llama3.2:1b` via Ollama) genera descripciones/resumenes cortos de cada thread
- [ ] Las descripciones/indices se aprueban por un mod antes de entrar al indice
- [ ] El indice se actualiza cuando un thread recibe actividad significativa

### LLM Topic Router
- [ ] LLM (`llama3.2:1b`) recibe el resumen de la conversacion + lista de threads indexados
- [ ] Retorna el ID del thread que matchea, o "NEW" si no hay match
- [ ] Modelo corre local via Ollama — sin costos de API, inference rapido con 1B params
- [ ] Prompt estructurado: solo retorna ID o "NEW", sin explicaciones

### Configuracion (admin)
- [ ] `conversation_min_messages` — mensajes minimos para triggerear (default: 5)
- [ ] `conversation_time_window` — ventana de tiempo en segundos (default: 600)
- [ ] `conversation_min_participants` — usuarios minimos (default: 2)
- [ ] `llm_model` / `llm_endpoint` — modelo y endpoint de Ollama
- [ ] `suggestion_cooldown` — cooldown entre sugerencias por canal
- [ ] `index_approval_required` — requerir aprobacion de mod para indexar

### Busqueda & Extras
- [ ] Busqueda semantica sobre la knowledge base indexada
- [ ] Auto-tagging de threads por el LLM

## Fase 6 — Lightning Network Zaps
> Pagos nativos entre usuarios via Lightning Network. Una wallet, todos los servidores.

### Wallet
- [ ] Wallet Lightning integrada por usuario (una sola wallet para todos los servidores)
- [ ] Conectar wallet existente (NWC — Nostr Wallet Connect, NIP-47)
- [ ] Balance visible en la UI (sidebar o navbar)
- [ ] Historial de transacciones (zaps enviados/recibidos)

### Zaps entre usuarios
- [ ] Zap rapido desde el perfil de un usuario (click en el avatar → zap)
- [ ] Zap en mensajes (boton de zap junto a reacciones)
- [ ] Monto personalizado o presets configurables (ej: 21, 100, 500, 1000 sats)
- [ ] Animacion/efecto visual al recibir un zap (notificacion + efecto en el mensaje)
- [ ] Zap con mensaje opcional (nota adjunta al pago)

### Emoji Zaps (reacciones con sats)
- [ ] Emojis predefinidos con monto de zap asociado (ej: ⚡ = 21 sats, 🔥 = 100 sats, 🚀 = 500 sats, 💎 = 1000 sats)
- [ ] Configuracion de emoji-zaps por servidor (admin elige emojis y montos)
- [ ] Un click en emoji-zap = reaccion + pago instantaneo
- [ ] Contador visible de sats acumulados por mensaje
- [ ] Leaderboard de zaps por canal/servidor (top zappers, top zapped)

### Integracion Nostr
- [ ] Zaps como eventos Nostr (NIP-57 — Lightning Zaps)
- [ ] Verificacion de zap receipts desde relays
- [ ] Zap splits (distribuir un zap entre multiples usuarios)

## Fase 7 — Obelisk Lite (Web + Mobile)
> Una app nueva, simple, zero learning curve — misma red, misma gente, otra experiencia.

Despues de completar la experiencia Discord-like (Fases 1-6), construir un cliente alternativo pensado para usuarios no-tecnicos. Intercompatible al 100% con Obelisk: mismos servidores, canales, mensajes, miembros.

### Filosofia
- **Zero learning curve** — si sabes usar WhatsApp/Telegram, sabes usar Obelisk Lite
- **Mobile-first** — diseñado para celular, funciona en web tambien
- **Misma red** — conecta al mismo backend, ve los mismos mensajes y personas
- **Sin jerga tecnica** — no muestra pubkeys, relays, ni conceptos de Nostr al usuario casual

### Scope
- [ ] App mobile (React Native o PWA nativa) + webapp responsive
- [ ] UI simplificada: lista de chats (tipo WhatsApp), vista de mensajes, perfil basico
- [ ] Onboarding guiado — login con NIP-07/nsec/bunker pero con UX amigable (wizard paso a paso)
- [ ] Notificaciones push (mobile)
- [ ] Canales se muestran como "grupos" con nombres y fotos
- [ ] Threads se muestran como respuestas inline (sin cambiar de vista)
- [ ] Sin panel de admin/moderacion (solo disponible en Obelisk full)
- [ ] Compartir invitaciones por link / QR
- [ ] Media: fotos, links con preview, emojis
- [ ] Busqueda simple de mensajes

### Intercompatibilidad
- Mismo backend (API + Socket.io + DB)
- Un mensaje enviado desde Lite aparece en Obelisk full y viceversa
- Miembros, roles, bans, mutes — todo compartido
- El admin gestiona desde Obelisk full, los usuarios usan Lite para chatear

## Known Bugs
- [ ] Online users not updating — all users appear as online regardless of actual status
- [ ] No way to delete servers from /admin — created servers cannot be removed
- [x] Server creation UI visible to all users — fixed: instance owner or existing owners only
- [x] WoT bypass on signup — fixed: login no longer auto-joins; `/api/servers/[id]/join` enforces WoT
- [ ] Lateral member list does not update per server — debe reflejar los miembros del servidor que el usuario esta viendo actualmente (cambiar de servidor debe re-cargar la lista de miembros, roles y estado online correspondientes)

## Test Suite (continuo)
> 47+ test files. Vitest + React Testing Library.

- [x] Setup: Vitest + jsdom + React Testing Library
- [x] Auth tests: roles, permisos, auth stores
- [x] Channel tests: CRUD canales, categorias, sidebar, foros
- [x] Message tests: envio, reacciones, posts, MessageArea, MessageInput
- [x] DM tests: store, DMList, DMChat, NewDMModal, ProtocolPrompt, dm lib (send/discover/detect)
- [x] Members tests: MemberRow, invitaciones
- [x] Search tests: SearchBar, search store, search lib
- [x] Voice tests: VoiceChannel, VoiceControls, voice store
- [x] Admin tests: admin page, ChannelManager, InviteManager, ConfirmDialog, BanReasonDialog, RoleBadge
- [x] Moderation tests: moderation page, ModActionCard
- [x] i18n tests: LanguageToggle, strings ES/EN
- [x] Store tests: auth, chat, dm, nav, notification, search, voice
- [ ] Multimedia tests: Upload, preview, limites de tamaño, tipos permitidos
- [ ] WebSocket tests: conexion, reconexion, multiples clientes simultaneos, broadcast
- [ ] E2E flows: Playwright — usuario se registra -> entra a canal -> manda mensaje -> otro usuario lo ve
- [ ] Load tests: multiples usuarios concurrentes, flood de mensajes
- [ ] CI pipeline: tests corren en cada PR
