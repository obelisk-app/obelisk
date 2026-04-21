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

## ⚡ PRIORIDAD — i18n de toda la app (por usuario)
> Hoy solo la landing page esta traducida (ES/EN). El resto de la app (chat, admin, moderacion, foros, settings, modales, toasts, errores) esta en una mezcla de espanol e ingles hardcodeada. Hay que migrar todos los strings a i18n y que cada usuario tenga su propio idioma persistido.

- [ ] Auditoria: listar todos los strings hardcodeados en `src/components/**`, `src/app/**`, toasts, errores de API, placeholders, tooltips, aria-labels
- [ ] Reusar la infraestructura i18n existente de la landing (mismo provider, mismos archivos `es.json`/`en.json`) y extenderla a toda la app
- [ ] Namespaces por area: `chat`, `admin`, `moderation`, `forum`, `settings`, `auth`, `common`, `errors` — para no tener un unico diccionario gigante
- [ ] Migracion incremental por area (chat → admin → moderation → forum → settings → modales/toasts → mensajes de error del backend)
- [ ] **Deteccion de idioma inicial por IP en el primer login** — endpoint server-side que resuelve el pais via IP (Cloudflare `CF-IPCountry` header o similar) y mapea a idioma default (ej: AR/ES/MX/CL/UY/... → `es`, resto → `en`). Se setea al crear el `Member`/`User` la primera vez
- [ ] Fallback al `Accept-Language` del browser si la IP no resuelve
- [ ] **Preferencia de idioma por usuario persistida en DB** — nuevo campo `User.language` (o `Member.language` si es per-server, pero preferir per-user global) — default se llena con la deteccion por IP en el primer login
- [ ] Selector de idioma en `/settings` (o menu de usuario) que actualiza `User.language` via PATCH y refresca la UI en caliente sin recargar
- [ ] El idioma del usuario tiene precedencia sobre cualquier default del servidor (el "idioma canonico del servidor" de Fase 2 sigue aplicando solo para mensajes del sistema generados por el server, no para la UI del cliente)
- [ ] SSR-friendly: el layout raiz lee `User.language` de la sesion y setea `<html lang>` + hidrata el provider con el idioma correcto para evitar flash de idioma incorrecto
- [ ] Tests: deteccion por IP con headers mockeados, fallback a Accept-Language, PATCH de preferencia, render de componentes clave en ES y EN, no quedan strings hardcodeados en los archivos migrados (lint rule o test de snapshot por locale)

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
    - [x] **Revocacion de invite links** — boton "Revoke" en `InviteManager`, soft-delete (`revokedAt`/`revokedBy`), redeem devuelve 410 "Invitation revoked", historia de quien entro preservada en /admin
    - [ ] Override manual: admin puede whitelistear un npub que no esta en la WoT
  - [ ] Config de umbrales para que usuarios comunes desbloqueen invites (dias activos, mensajes minimos, invites por usuario)
- [ ] Sistema de roles y permisos por servidor — ver [docs/permissions-plan.md](docs/permissions-plan.md) (write-locks por canal/post ya documentados); ahora ampliar a **roles custom + acceso por canal**
  - [x] Roles (owner/admin/mod/member) por servidor — instance owner global
  - [x] Asignar roles por servidor (mod en server A, member en server B) — schema soporta, /admin permite cambiar role
  - [ ] **Roles custom por servidor** (ej: "Gold", "VIP", "Founder", "Beta Tester") — el admin define nombre, color, icono y prioridad/orden
    - [ ] Nuevo modelo `Role { id, serverId, name, color, icon, priority }` y tabla pivote `MemberRole { memberId, roleId }` (un miembro puede tener varios roles custom + el role base owner/admin/mod/member)
    - [ ] CRUD de roles desde /admin → nueva tab "Roles" (crear, editar, borrar, reordenar, asignar a miembros)
    - [ ] Badges de roles custom visibles en el sidebar de miembros y en los mensajes (al lado del nombre)
    - [ ] **Member list agrupada por rol (estilo Discord)** — el sidebar lateral de miembros se separa en secciones por rol, ordenadas por `priority`. Cada sección muestra el nombre del rol + conteo de miembros online en ese rol (ej: "Owner — 1", "Gold — 12", "Members — 47", "Offline — 23"). Un miembro aparece bajo su rol custom de mayor prioridad (los roles base owner/admin/mod cuentan como secciones también si no tiene custom). Sección "Offline" colapsable al final.
  - [ ] **Permisos configurables por rol** — matriz de permisos (quien puede crear canales, invitar, kickear, banear, mutear, gestionar roles, gestionar webhooks, etc.) editable desde /admin
  - [ ] **Canales privados por rol (read-access gating)** — además del `writePermission` ya planeado, agregar `readPermission`/`allowedRoleIds` por canal
    - [ ] Schema: `Channel.allowedRoleIds String[]` (vacío = visible para todos los miembros). Si tiene roles, solo miembros con al menos uno de esos roles pueden listarlo, conectarse al socket room, y leer mensajes
    - [ ] Enforcement en backend: GET de canales filtra por rol del miembro; REST y Socket.io rechazan suscripciones / mensajes de usuarios sin permiso
    - [ ] UI: ChannelSidebar oculta canales no permitidos; ChannelManager en /admin permite seleccionar qué roles ven cada canal (multi-select)
    - [ ] Caso de uso: canal "#gold-lounge" solo visible para miembros con role "Gold"; canal "#mods-only" solo visible para mods+
  - [ ] Control de acceso a servidores por rol — quien puede ver/unirse a cada servidor (servidores privados solo para roles dados)
- [ ] **Canal tipo "updates" / anuncios del servidor** — un tipo de canal exclusivo para novedades del servidor
  - [ ] Nuevo valor en `Channel.type`: `updates` (además de `text`, `voice`, `forum`)
  - [ ] Solo owner/admin (y roles con permiso `postUpdates`) pueden publicar; el resto solo lee y reacciona
  - [ ] Formato de post tipo "announcement": título + cuerpo markdown + cover image opcional (reusar `Message.coverImageUrl`) + tags de versión/categoría (`release | changelog | event | notice`)
  - [ ] Un solo canal `updates` puede designarse como el "feed oficial" del servidor (`Server.updatesChannelId`, FK opcional) — las nuevas entradas disparan notificación push a todos los miembros (respetando settings de notificaciones) y aparecen pinneadas en el sidebar con un badge
  - [ ] Cross-post / follow: un update publicado en un server puede ser seguido por otros servers (estilo Discord "Announcement channels") — opcional, detrás de un flag
  - [ ] UI: render distinto al chat normal — layout tipo "blog post" con reacciones pero sin thread inline (las respuestas abren un sub-thread estilo forum)
  - [ ] Tests: role guard de posting, notificación disparada, render correcto del layout, cross-post si se implementa
- [ ] **Templates de canales (channel templates)** — para que crear servidores nuevos sea instantáneo
  - [ ] Templates predefinidos: "Community" (general, anuncios, off-topic, suggestions, foro-help), "Gaming" (general, voice-lobby, voice-game, lfg, clips), "DAO" (anuncios, propuestas, votaciones, tesoro, foro-debate), "Dev Team" (general, standup, prs, deploys, bugs, foro-design)
  - [ ] Cada template define categorías + canales + tipos (text/voice/forum) + permisos por defecto
  - [ ] Selector de template al crear un nuevo servidor desde /admin → "+ New Server" (incluye opción "Empty / Custom")
  - [ ] **Custom templates** — el admin puede guardar la estructura actual de un servidor como template propio y reutilizarla
  - [ ] Aplicar template a un servidor existente (merge no destructivo: solo agrega canales/categorías que no existen)
- [x] **Designar un canal como "welcome channel" desde /admin** — configurable desde admin con WelcomeBotSettings
  - [x] Campo `Server.welcomeChannelId` (FK opcional a `Channel`) editable desde /admin
  - [x] El job que postea el mensaje de bienvenida lee `welcomeChannelId`; si es null, no postea nada
  - [x] Preview del mensaje de bienvenida en /admin con el avatar/nombre del último miembro como ejemplo
  - [x] Validación: si el canal seleccionado se borra, `welcomeChannelId` se setea a null automáticamente (onDelete SET NULL)
- [ ] **Pinned messages + contenido editable de canales desde /admin (paridad con `prisma/seed.ts`)**
  > **Contexto:** la versión deployed de La Crypta está atrasada respecto a `prisma/seed.ts` porque el contenido inicial (mensaje de bienvenida en `empezá-acá`, posts del foro `indice` con reglas/actividades/proyectos/redes, posts del foro `méritos` con plantillas de reclamo, descripciones de canales, emojis, tags, etc.) está **hardcoded en el seeder** y solo se aplica en la creación inicial. Una vez que el server existe, no hay forma de editar ese contenido desde la UI — habría que re-correr el seeder y eso no actualiza filas existentes. Hay que migrar todo eso a entidades editables desde /admin para que el deploy de prod no quede atrás del código.
  - [ ] **Pinned messages por canal** — schema: `Message.pinned Boolean @default(false)` + `Message.pinnedAt`, `Message.pinnedBy`. Backend: endpoint `PATCH /api/admin/messages/[id]/pin` (admin+) y `GET /api/channels/[id]/pins`. UI: panel "Pinned" en el header del canal estilo Discord (dropdown con los pinned), botón "Pin message" en el menu contextual del mensaje (admin/mod+), badge 📌 en el mensaje pinneado dentro del scroll. Funciona también para forum posts (pinned posts aparecen primero en la lista).
  - [ ] **Channel description / topic editable** — `Channel.description` ya existe (o agregarlo si no): editable desde /admin → ChannelManager y desde un settings gear en el header del canal (admin+). Se renderiza en el header del canal estilo Discord ("# chat-general — descripción del canal").
  - [ ] **Channel info / "rules" content** — para canales tipo `empezá-acá` o `indice` que hoy tienen contenido seeded, agregar un panel sticky de "info del canal" editable desde /admin (markdown completo, igual que el body actual del seeder). Se muestra arriba del primer mensaje, colapsable.
  - [ ] **Migración de contenido del seeder a la DB editable** — script de migración one-shot que toma cada bloque hardcoded de `seed.ts` (welcome message de empezá-acá, posts de indice, posts de méritos, etc.) y lo crea como mensaje pinneado o forum post asignado al system member, **solo si no existe ya** (idempotente). Después de correr el script, esos contenidos viven en la DB y son editables desde /admin sin tocar código.
  - [ ] **Refactor de `prisma/seed.ts`**: el seeder pasa a crear solo la estructura mínima (server + categorías + canales vacíos + tags) y deja el contenido a la migración de arriba o a admins editando desde /admin. Idempotente, seguro de re-correr en cada deploy.
  - [ ] **Editor de "definición funcional" de canales** — algunos canales del seed tienen un rol funcional (empezá-acá = onboarding, méritos = reclamo de roles, índice = reglas/recursos). Agregar `Channel.purpose` enum opcional (`onboarding | rules | announcements | merit_claim | normal`) que la UI usa para mostrar widgets/botones específicos (ej: en `merit_claim` aparece un botón "Reclamar este mérito" que abre un form). Configurable desde /admin → ChannelManager.
  - [ ] Tests: pin/unpin endpoint con role guards, render del panel de pinned, ChannelManager edita description/info/purpose, migración del seeder es idempotente.
- [ ] **Admin panel — mejoras de UX para gestionar canales y roles**
  - [ ] Drag & drop para reordenar canales y categorías directamente en /admin (hoy hay que usar inputs de posición numéricos)
  - [ ] Edición inline del nombre, tipo, descripción y permisos de un canal sin abrir un modal
  - [ ] Bulk actions: seleccionar varios canales para borrar, mover de categoría, o cambiar permisos en lote
  - [ ] Vista preview del sidebar tal como lo verá un miembro con cierto rol (rol switcher para testear visibilidad de canales privados)
  - [ ] Editor visual de la matriz de permisos por rol (checkboxes en grid, igual que Discord)
  - [ ] Confirm dialogs claros para acciones destructivas (borrar canal con N mensajes, borrar rol asignado a N miembros)
- [ ] **Dashboard de estadísticas para el instance owner** — `/admin/stats` con métricas agregadas de uso y media del deployment
  - [ ] Storage: uso total de `/uploads/` + breakdown por tipo (imágenes, audio, emojis, stickers) + top 20 archivos/uploaders por tamaño
  - [ ] Media: cantidad de mensajes con attachments, distribución por mime-type, tasa de crecimiento semanal/mensual
  - [ ] Actividad: mensajes/día, usuarios activos (DAU/WAU/MAU), canales más activos, minutos en voz, peak concurrent sockets
  - [ ] Usuarios: total miembros, signups via WoT vs invite vs manual, retención (cohorts), top posters
  - [ ] Servidores: breakdown por server (mensajes, miembros, storage) para detectar hotspots
  - [ ] DB: tamaño de tablas principales (Message, Member, Upload), índice de crecimiento
  - [ ] Export CSV/JSON de cada vista + endpoint `/api/admin/stats` (instance owner only)
  - [ ] Tests: agregaciones correctas, role guard (solo instance owner), performance con datasets grandes (usar queries agregadas, no cargar todo en memoria)
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
- [x] Popover de perfil al click en avatar/nombre/mencion — foto, banner, display name (con emoji shortcodes resueltos), NIP-05, roles (base + custom) y fecha de ingreso al server
- [ ] **Mensajes directos (DMs) 1-a-1**
  - [ ] Boton "Enviar mensaje" en `ProfilePopover` (pendiente — agregar cuando DMs esten implementados)
  - [ ] Nuevo modelo `DirectConversation` + `DirectMessage` en Prisma (scoped por pubkey pair, no por server)
  - [ ] API routes: `GET/POST /api/dms`, `GET/POST /api/dms/[conversationId]/messages`
  - [ ] Socket.io rooms `dm:${conversationId}` con misma semantica de typing/reactions/edits que canales
  - [ ] UI: inbox de DMs en `ServerBar` (icono aparte) + `DMSidebar` con lista de conversaciones
  - [ ] Enforcement: solo puede iniciar DM si ambos comparten al menos un server (anti-spam)
  - [ ] Tests: apertura de conversacion, envio/recepcion, enforcement de server en comun
- [ ] **Llamadas directas 1-a-1 (audio/video)**
  - [ ] Boton "Llamar" en `ProfilePopover` (pendiente — agregar cuando este feature este listo)
  - [ ] Reuso del pipeline WebRTC peer-to-peer existente pero sin SFU (directo entre dos peers)
  - [ ] Señalizacion via Socket.io events `dm-call-invite` / `dm-call-accept` / `dm-call-reject` / `dm-call-end`
  - [ ] UI de llamada entrante (modal con ringtone) + UI de llamada en curso (reusa `VoiceControls`)
  - [ ] Tests: invite/accept/reject flow, fin de llamada, cleanup de peer connection
- [x] Canales de voz — audio (via mediasoup WebRTC SFU)
- [x] Canales de voz — video y screen sharing
- [ ] Canales de voz — chat dentro del canal de voz
- [ ] **Canales de voz — E2EE sobre SFU (insertable streams)**
  - [ ] En modo `sfu` (LiveKit) el media se re-encripta en el SFU — el server ve frames en claro. En modo `mesh` ya es efectivamente E2E (media P2P, server solo relay de signaling).
  - [ ] Activar LiveKit E2EE via insertable streams (WebCrypto frame encryption) para que el SFU solo reenvie ciphertext
  - [ ] Derivacion de clave por canal — opcion 1: passphrase compartida; opcion 2: key exchange por Nostr (NIP-44) entre participantes al unirse
  - [ ] Toggle por canal: `Channel.voiceE2EE` (bool) — admin decide si el canal requiere E2EE (solo aplica a `voiceMode: 'sfu'`)
  - [ ] UI: badge "E2EE" en el header del canal de voz cuando esta activo + indicador de key mismatch si un peer no puede desencriptar
- [ ] **Canales de voz — modo "town hall" / llamadas masivas con raise hand**
  - [ ] Nuevo tipo de permiso por canal de voz: `voiceMode` = `open` (todos hablan, actual) | `moderated` (raise-hand)
  - [ ] En modo `moderated`: los participantes entran muteados a nivel de servidor y sin poder desmutearse por su cuenta
  - [ ] Boton "Raise hand" en `VoiceControls` — emite evento socket `voice-raise-hand` / `voice-lower-hand`
  - [ ] Cola de manos levantadas visible para owner/admin/mod del server (orden FIFO con timestamp)
  - [ ] Acciones del moderador sobre una mano levantada: `grant-speak` (otorga permiso temporal para desmutearse) / `deny` (baja la mano) / `revoke-speak` (fuerza mute de nuevo cuando termina)
  - [ ] Nuevos eventos server: `voice-hand-raised`, `voice-hand-lowered`, `voice-speak-granted`, `voice-speak-revoked` — broadcast al room `voice:${channelId}`
  - [ ] Nuevo modelo `VoiceHand` (o campos en `VoiceState`): `pubkey`, `channelId`, `raisedAt`, `speakGrantedBy`, `speakGrantedAt`
  - [ ] Enforcement server-side: `voice-camera-claim` y el gate de unmute chequean `voiceMode` + permiso otorgado; el cliente no alcanza, tiene que validarlo el server
  - [ ] UI: indicador visual de "mano levantada" en la tarjeta del participante + panel lateral con la cola para moderadores
  - [ ] Limite configurable de hablantes concurrentes en modo `moderated` (ej: solo N pueden estar con permiso a la vez)
  - [ ] Auto-revoke de permiso cuando el usuario se silencia o sale del canal
  - [ ] Tests: cambio de modo por admin, raise/lower hand, grant/revoke, enforcement de mute cuando no hay permiso, cola ordenada, limite de hablantes
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
- [ ] **Links relativos a canales / posts / threads (`#{nombre}`) — autocomplete estilo Discord**
  - [ ] Trigger `#` en `MessageInput` abre un `ChannelAutocomplete` (espejo de `MentionAutocomplete` / `EmojiAutocomplete`) con regex `/#([\w-]*)$/`, keyboard nav (↑ ↓ Enter Tab Esc) y cursor-restore via `requestAnimationFrame`
  - [ ] Lista fuzzy-match sobre canales del servidor actual (texto, voz, foro) + posts de foro abiertos + threads; agrupado por tipo con iconos (`#` texto, `🔊` voz, `📋` foro, `💬` thread/post)
  - [ ] Resolución server-side: al enviar, matchear `#{nombre}` contra canales/posts del `serverId` y persistir como placeholder estable (ej: `\u3008CHANNEL:<id>\u3009` / `\u3008POST:<id>\u3009` / `\u3008THREAD:<id>\u3009`) — análogo a cómo se persisten mentions/emojis
  - [ ] Render en `MessageContent`: placeholder → pill clickeable con el nombre actual del canal/post (re-resuelto en render, así un rename se refleja sin tocar el mensaje); fallback a texto crudo `#nombre` si el target fue borrado
  - [ ] Click navega al canal/post/thread dentro del mismo servidor sin full reload (actualiza `chat` store + URL)
  - [ ] Cross-server: si el nombre es ambiguo o el usuario quiere apuntar a otro servidor, soportar `#server:canal` (opcional, fase 2)
  - [ ] Permisos: el autocomplete sólo sugiere canales/posts que el usuario puede ver; al renderizar para otro usuario sin acceso, mostrar pill deshabilitada con tooltip "Sin acceso"
  - [ ] Notificación: si el canal linkeado es un post/thread del que el autor es dueño, contar como "mención a post" (reusar sistema de notifications)
  - [ ] Paridad con posts de foro: el mismo autocomplete funciona dentro de `ForumView` una vez que reusa `MessageInput` (ver refactor de foros)
  - [ ] Tests: regex del trigger, fuzzy match, resolución placeholder, render con rename/delete, navegación al click, gating por permisos
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
- [ ] **Multi-server (crear/unirse a varios servidores)** ⚠️ IMPORTANTE
  - [ ] Flujo de "sin servidores": cuando un usuario loguea y no es miembro de ningún servidor, mostrar pantalla de onboarding (unirse via invite, buscar servidores públicos, o crear uno nuevo)
  - [ ] Creación de servidores por cualquier usuario: UI + API para que cualquier usuario autenticado pueda crear su propio servidor (nombre, icono, configuración inicial)
- [x] DMs via Nostr relays (encrypt/decrypt con el signer del usuario, NIP-04/NIP-17)
- [ ] **Vista personalizada de canales/posts por actividad del usuario**
  > Cada usuario ve en su sidebar solo los canales/posts con los que realmente interactua, no la lista completa del servidor. Ej: el foro "Plaza Publica" tiene 200 posts; al usuario solo le interesan los 3 en los que esta participando, no el resto. Reduce ruido y hace la navegacion personal.
  - [ ] Tracking de interaccion por usuario: ultima vez que el usuario escribio o reacciono en un canal/post (campo `lastInteractionAt` en una tabla `UserChannelActivity { userPubkey, channelId, lastInteractionAt, lastReadAt }` — o reusar/extender el tracking de read-state de notificaciones)
  - [ ] Sidebar del chat: por defecto muestra canales/posts ordenados por `lastInteractionAt` desc (los que el usuario "habita"), no la lista completa
  - [ ] En canales de foro: la vista detalle de cada post aparece en el sidebar del usuario una vez que escribio o reacciono en el post; posts donde nunca interactuo quedan solo en la lista del foro, no en el sidebar
  - [ ] Toggle "ver todos los canales" para expandir y ver la lista completa del servidor (comportamiento actual)
  - [ ] **Pin manual por usuario**: cada usuario puede fijar canales/posts a su propia vista (independiente de los pins de mods/admins a nivel servidor); modelo `UserPin { userPubkey, channelId? , postId?, pinnedAt }`
  - [ ] Los pins del usuario quedan arriba del sidebar, luego el resto ordenado por actividad reciente
  - [ ] Respeta permisos de lectura: si el usuario pierde acceso a un canal/post, desaparece de su vista personalizada
  - [ ] Tests: ordenamiento por `lastInteractionAt`, pin/unpin personal, posts aparecen solo tras interactuar, permisos de lectura filtran la vista
- [ ] Eliminacion de cuenta y datos del usuario
  - [ ] Opcion en settings/perfil para eliminar cuenta
  - [ ] Eliminar todos los mensajes del usuario (o reemplazar con "[mensaje eliminado]")
  - [ ] Eliminar membresías, sesiones, bans, mutes, warnings y reports asociados
  - [ ] Confirmacion explicita antes de proceder (accion irreversible)
  - [ ] API endpoint protegido (solo el propio usuario puede eliminar su cuenta)

## Fase 3 — Features Avanzados
- [~] **Mute / Block de usuarios (client-side → Nostr-synced)**
  - [x] Mute/Block local persistido en `localStorage` (`src/store/moderation.ts`), botones en `ProfilePopover` (🔕 Silenciar / 🚫 Bloquear), filtrado de mensajes de usuarios bloqueados en `MessageArea`
  - [ ] Suprimir menciones/notificaciones de usuarios silenciados (wire en `useNotificationStore` + toast/favicon badge para respetar `mutedPubkeys`)
  - [ ] Ocultar usuarios bloqueados del `MemberList`, `MentionAutocomplete`, DM inbox y `ReplyPreview`
  - [ ] **Sincronizar con Nostr via NIP-51 (Mute List, kind `10000`)** para que el mute/block siga al usuario entre dispositivos/clientes
    - [ ] Al togglear: leer el kind 10000 actual del usuario (como con kind 0 — nunca asumir lista vacía), mergear el tag `["p", <pubkey>]` agregado/removido, volver a publicar con `content` cifrado via NIP-04/NIP-44 (los tags privados van en el `content` cifrado al propio pubkey, los públicos en tags — por defecto usar cifrado: mute/block es información sensible)
    - [ ] Al login: hydratar el store leyendo el kind 10000 más reciente del usuario (replaceable event) y cachearlo en `profileCache`
    - [ ] Distinguir **mute** (silenciar notificaciones, mensajes visibles) vs **block** (ocultar contenido). NIP-51 sólo define "mute" — para "block" usar un tag custom (`["p", pk, "", "block"]`) o una lista separada kind `30000` con `d=obelisk:blocked`, documentar la convención en `docs/`
    - [ ] Importar/respetar la mute list existente del usuario en otros clientes (Amethyst, Damus) para que no tenga que re-silenciar a nadie al llegar a Obelisk
    - [ ] ⚠️ Misma precaución que con kind 0: nunca sobreescribir la lista sin leer la última versión; mostrar diff si hay cambios remotos desconocidos antes de re-publicar
  - [ ] Opción global "Ignorar mute list de Nostr en este dispositivo" por si el usuario quiere ver un canal completo sin sus mutes
- [ ] **Nostr relay-based groups (NIP-29 / relay-native)** — migrar (o sumar) un modo donde los servidores viven en relays Nostr en vez de (o además de) la DB del backend
  - [ ] Lectura previa antes de implementar: https://habla.news/u/hodlbod@coracle.social/1741286140797 (hodlbod sobre el estado de los grupos en Nostr, trade-offs de NIP-29 vs alternativas)
  - [ ] Definir si Obelisk corre su propio relay de grupos o habla con relays externos compatibles
  - [ ] Mapear el modelo actual (Server/Channel/Message/Member/Role) contra los kinds de NIP-29 y documentar gaps
- [ ] Perfiles de app (avatar, bio, display name — datos propios, no de Nostr)
- [ ] Edicion de perfil Nostr desde Obelisk (publicar kind 0 a relays)
  > ⚠️ **CUIDADO:** Publicar un kind 0 (metadata) sobreescribe TODA la metadata del usuario en los relays. Antes de implementar: (1) siempre leer el kind 0 actual del usuario, (2) mergear solo los campos editados, (3) mostrar preview/diff antes de publicar, (4) pedir confirmacion explicita, (5) nunca enviar campos vacios que borren datos existentes. Un campo mal enviado puede destruir avatar, bio, NIP-05 del usuario en todo Nostr.
- [ ] Exportar conversaciones (JSON / texto plano)
- [ ] Bots / integraciones
  - [ ] **Compatibilidad con bots de Discord existentes** — que un bot escrito para Discord pueda apuntar a Obelisk cambiando solo el endpoint, sin reescribir el código
    - [ ] Implementar un subset del Discord REST API v10 bajo `/api/discord/v10/*` (gateway-compatible shapes para `Guild`, `Channel`, `Message`, `Member`, `Role`, `User`) que mapea contra los modelos internos de Obelisk
    - [ ] Implementar un Gateway WebSocket compatible (opcodes 0/1/2/10/11 mínimo: dispatch, heartbeat, identify, hello, heartbeat ack) que reemite eventos `MESSAGE_CREATE`, `MESSAGE_UPDATE`, `MESSAGE_DELETE`, `GUILD_MEMBER_ADD`, `INTERACTION_CREATE`, etc. desde Socket.io
    - [ ] Bot tokens: nuevo modelo `BotAccount { id, serverId, name, token, ownerPubkey, permissions }` — generables desde /admin → tab "Bots", el bot autentica con `Authorization: Bot <token>` igual que Discord
    - [ ] Mapeo de IDs: snowflake-like IDs (string) en la capa compat para no romper bots que asumen IDs numéricos largos; tabla de traducción interna `discord_id ↔ obelisk_id`
    - [ ] Soporte para slash commands / interactions (subset de application commands) para que bots de música, moderación, polls, etc. funcionen out of the box
    - [ ] Documentar incompatibilidades conocidas (features de Discord no soportadas: stages, threads de Discord, stickers, etc.) en `docs/discord-bot-compat.md`
    - [ ] Test de smoke: correr un bot público popular (ej: un bot de polls minimal) contra Obelisk y validar que funciona sin cambios de código
- [x] Busqueda de mensajes (Discord-style: from:, in:, has:, before:, after:, mentions:, "exact phrases")
- [~] Upload de archivos/media
  - [x] Boton de adjuntar en el message input (menu "+", opcion "Subir un archivo")
  - [x] Subida **multiple** (file input con `multiple`, paste de multiples items, upload en paralelo)
  - [x] Paste de imagenes desde el portapapeles (Cmd/Ctrl+V)
  - [x] Preview chips **antes de enviar** (thumbnails + tarjetas de doc con boton X para remover cada adjunto)
  - [x] Preview inline de imagenes (via `MessageContent` / `isImageUrl`, con URL crudo oculto)
  - [x] **Matrix dinamica de imagenes estilo Discord** (`ImageGallery`): 1 grande, 2 lado a lado, 3 (1 grande + 2 stack), 4 en 2x2; 5+ muestra las primeras 4 con overlay "+N" y abre lightbox
  - [x] **Lightbox / carousel** con flechas prev/next, teclado (← → Esc), contador "n / total"
  - [x] Soporte para archivos genericos (PDF, DOC, ZIP, TXT, etc.) renderizados como `AttachmentCard` con icono y descarga
  - [x] Almacenamiento en el servidor del host (`public/uploads/`, sirve via `/uploads/<name>`)
  - [x] Emoji picker (curated unicode, sin dependencias externas)
  - [x] **Busqueda bilingue en el emoji picker** (keywords EN + ES, accent-insensitive)
  - [x] **Videos** (MP4, WebM, MOV, OGV) con reproductor inline (`<video controls>`) hoisted del body igual que las imagenes
  - [x] Preview de video en el chip de adjuntos pendientes (thumb del frame 0 + overlay play)
  - [x] **Caps por categoria** en `src/lib/attachments.ts`: imagenes 10 MB, videos 50 MB, documentos 25 MB (`maxBytesFor(mime)` enforced en el endpoint)
  - [x] **Maximo 10 archivos por mensaje** (`MAX_ATTACHMENTS_PER_MESSAGE`), enforced en client con error message si se sobrepasa

  > **Plan de trabajo para los items pendientes**: `~/.claude/plans/tingly-whistling-meteor.md` — ordenado por PR con verificacion por paso. Decisiones clave: shortcodes se resuelven en **render-time** (la DB guarda `:smile:`), emojis custom uploadables por **mod+**, compresion/transcoding **deferred** (requiere cambios al Docker image).

  - [x] **Composer UX polish**
    - [x] Drag & drop de archivos sobre el message input (overlay visual, reusa `uploadFiles` existente, respeta el cap de 10)
    - [x] Preview inline de **audio** (mp3/ogg/wav/m4a/webm) — mismo patron de hoist que video + `<audio controls>`, nueva constante `MAX_AUDIO_BYTES`
    - [x] **Zoom + pan dentro del lightbox** (`ImageGallery`): wheel = zoom (1x–5x), click-drag = pan cuando zoom > 1, dblclick = reset, backdrop-close deshabilitado mientras esta zoomeado
    - [x] **Progreso individual por archivo** en los chips pendientes (switch de `fetch` a `XMLHttpRequest.upload.onprogress`; el chip se inserta con `uploading: true, progress: 0` y se finaliza on load)
  - [x] **Shortcodes `:name:` para emojis** — resolucion en **render-time** (la DB guarda `:smile:`, `MessageContent` hace el swap)
    - [x] `src/lib/emoji-shortcodes.ts`: mapa `name → unicode` construido desde `EmojiEntry.keywords[0]` del picker + aliases curados (`+1`, `thumbsup`, `heart`...); export `resolveUnicodeShortcode(name)`
    - [x] `EmojiAutocomplete` (espejo de `MentionAutocomplete`) disparado por regex `/:([\w+-]*)$/` en `MessageInput`, con keyboard nav (↑ ↓ Enter Tab Esc) y cursor-restore via `requestAnimationFrame`
    - [x] Render swap en `MessageContent` antes del markdown: regex con word-boundary que preserva bloques de codigo y URLs (`http://x.com/:colon:` NO matchea); follow-up = remark plugin AST-correcto
    - [x] Tests: code block preservation, URL con colons, multiples shortcodes por linea
  - [x] **Emojis custom por servidor**
    - [x] Modelo `ServerEmoji { id, serverId, name, url, createdBy, createdAt }` con `@@unique([serverId, name])`, name regex `[a-z0-9_-]{2,32}`
    - [x] Migration `add_server_emojis_and_upload_limits`
    - [x] `GET /api/admin/emojis?serverId=…` — abierto a miembros del servidor para que el cliente resuelva; `POST` y `DELETE` — **mod+** (`requireRole('mod')`)
    - [x] UI `EmojiManager` (nueva tab "Emojis" en `src/app/admin/[serverId]/page.tsx`): upload + name, lista con boton borrar
    - [x] `serverEmojis: Record<string, string>` en el store de chat, fetch al entrar al servidor
    - [x] Render en `MessageContent`: unicode primero, luego `serverEmojis[name]`; placeholders tipo mentions (`\u3008EMOJI:<name>\u3009`) swappeados a `<img class="inline-block w-5 h-5">`, fallback al texto crudo si el emoji no existe
    - [x] Reacciones custom en `MessageArea.ReactionsDisplay` (sin cambio de schema — la columna `Reaction.emoji` sigue siendo String, resolve via helper `resolveReactionEmoji`)
    - [x] Categoria "Server" al tope del `EmojiPicker` cuando hay emojis custom
  - [x] **Limites configurables por servidor**
    - [x] Migration: `maxImageBytes`, `maxVideoBytes`, `maxDocBytes`, `maxAudioBytes` (Int, defaults = constantes actuales), `allowedMimeTypes` (`String?`, JSON array; null = allowlist global)
    - [x] Extender el `allowed` whitelist de `PATCH /api/admin/server` con los nuevos fields; validacion de rango + **ceiling absoluto de 500 MB**
    - [x] `POST /api/upload?serverId=…` lee el server, construye `UploadLimits` via nuevo `parseServerLimits()` en `attachments.ts`, aplica override del cap; mensajes 413 citan el cap configurado
    - [x] Admin UI: `UploadLimitsForm` en la tab Settings con 4 number inputs en MB + 4 checkboxes por categoria; conversion MB ↔ bytes en el cliente
  - [ ] **Stickers por servidor** — boton dedicado en el composer (al lado del GIF), imagenes curadas por mods estilo Discord stickers
    - [ ] Modelo `ServerSticker { id, serverId, name, url, createdBy, createdAt }` con `@@unique([serverId, name])`
    - [ ] `GET /api/admin/stickers?serverId=…` (miembros); `POST`/`DELETE` mod+
    - [ ] `StickerPicker` component (espejo de `GifPicker`) abierto desde un boton `sticker-button` en `MessageInput` al lado del GIF
    - [ ] Admin UI: nueva tab "Stickers" en `src/app/admin/[serverId]/page.tsx` (upload + delete)
    - [ ] Mensaje de tipo sticker: render como imagen grande inline (no inline emoji-size); decidir si es un attachment o un campo dedicado
  - [ ] **Thumbnails de PDF** (primera pagina) — *deferred: requiere canvas native binding*
    - [x] `AttachmentCard` acepta `thumbnailUrl?: string` opcional (UI ready)
    - [ ] Generacion server-side con `pdfjs-dist` + `@napi-rs/canvas` (requiere rebuild del Docker image)
    - [ ] `MessageContent` deriva la thumbnail URL por convencion (`<url>.png`) y la pasa al card
  - [ ] **Compresion / transcoding** *(deferred — follow-up issue aparte)*
    > Requiere cambios al Docker image y deps nativas. Trackear en un issue separado con este plan como contexto.
    - Imagenes: `sharp` para re-encode + resize + strip EXIF en uploads grandes
    - Videos: `ffmpeg-static` para transcode uniforme (mp4 H.264) + thumbnails automaticos
    - Preservar original opcionalmente como fallback para descarga

## Fase 4 — Polish & Launch
- [ ] PWA (Progressive Web App) — installable, offline support, service worker
- [ ] **Notificaciones — fix + mejoras (estilo Discord)**
  > Fases 1-2 shipped: read-tracking logic fix, bech32/reply mentions, separador "New messages", favicon badge + title counter. Pendiente: per-channel settings, mute, sonido + toast, fix conteo de DMs.
  - [x] Auditar el estado actual: por qué no disparan, qué eventos las generan, qué store las trackea, qué pasa en background tab vs foreground
  - [x] **Fix crítico del mark-as-read**: un canal/DM sólo se marca leído cuando el tab está visible + enfocado + scrolleado al fondo (hook `useReadTracker`), con debounce 250ms. Antes, clickear un canal lo marcaba leído aunque estuvieras en otro tab
  - [x] **Fix menciones bech32**: el regex server-side sólo matcheaba hex, por lo que menciones `nostr:npub1<bech32>` (pegadas desde otros clientes) no creaban `Mention` ni disparaban `notification`. Extraído `extractMentionPubkeys()` en `src/lib/mentions.ts` con `nip19.decode`
  - [x] **Notificación de reply**: responder a un mensaje sin `@` ahora notifica al autor original (socket event `type: 'reply'` + `Mention` persistido)
  - [ ] Notificaciones in-app confiables: sonido + toast cuando llega un mensaje en un canal donde tenés permiso, una mención (@usuario), un reply a tu mensaje, o un DM
  - [ ] Notificaciones del browser (Notification API) cuando la pestaña está en background, con permission request explícito en settings
  - [ ] Settings de notificaciones por servidor y por canal: All / Mentions only / Nothing (igual que Discord), persistido en DB (`MemberChannelSettings { memberId, channelId, notify }`)
  - [ ] Mute de servidor / canal con duración (15min, 1h, 8h, 24h, hasta que reabra)
  - [x] **Badge de unread count en el favicon** — número rojo encima del favicon con la cantidad total de menciones + DMs sin leer (estilo Discord)
    - [x] Lib `lib/favicon-badge.ts`: dibuja el favicon base en un `<canvas>`, superpone un círculo rojo con el número (si > 99 muestra "99+"), exporta como dataURL y reemplaza `<link rel="icon">` dinámicamente
    - [x] Hook `useFaviconBadge(count)` que se suscribe al store de notificaciones y actualiza el favicon en cada cambio
    - [x] Resetea a 0 cuando la pestaña vuelve a foco y el usuario está leyendo el canal/DM con unreads (vía `useReadTracker`, que clea el store y el hook reacciona)
    - [x] Title de la pestaña también muestra el contador: `(3) Obelisk` para reforzar la señal
  - [x] Indicadores de unread en la UI: bullet point al lado del nombre del canal/server con unreads, badge con número para menciones, separador visual "New messages" en el chat
  - [x] Tracking server-side de `lastReadAt` por miembro/canal y por DM, sincronizado vía Socket.io para que el contador sea consistente entre dispositivos
  - [ ] Fix conteo de DMs en `/api/unread`: hoy devuelve binario (1 o 0 por thread) en vez del count real de mensajes no leídos
  - [ ] **Navegación entre menciones en chats largos**: cuando hay múltiples menciones al usuario en un canal, mostrar un indicador flotante (ej: "3 mentions ↑↓") con controles para saltar a la anterior/siguiente mención sin leer, scrolleando y resaltando el mensaje (estilo Discord jump-to-mention). Atajos de teclado (`F7` / `Shift+F7`) y click en el badge de unread-mentions del canal también navegan a la próxima mención pendiente
  - [x] Tests: store de notificaciones, lib favicon-badge (canvas mock), hook con cambios de count, `useReadTracker` (visibility/focus/scroll gating), `extractMentionPubkeys` (hex + bech32)
  - [ ] Tests pendientes: settings persistence (Phase 3)
- [ ] Temas personalizados por servidor
- [ ] Mejorar experiencia mobile
  - [ ] Elementos que se ocultan o quedan inaccesibles en pantallas chicas
  - [ ] Pantallas que no respetan el tamaño del viewport (scroll roto, overflow)
  - [ ] Revisar todas las vistas: chat, admin, moderacion, voice, foros
- [x] Deploy a produccion (Vercel + Neon Postgres)
- [ ] Restaurar real-time (Socket.io en Railway/Fly.io, o migrar a Pusher/Ably)
- [x] **Admin CLI** — `scripts/admin-cli/` autentica con su propio nsec / bunker NIP-46 y habla contra la misma API HTTP que el panel `/admin`. Pensado para ser driveado por agentes CLI de coding (Claude Code, Codex, Cursor, etc.), con los mismos `requireRole()` del lado del servidor. Ver [docs/admin-cli.md](docs/admin-cli.md).

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
> Pagos nativos entre usuarios via Lightning Network. Una wallet, todos los servidores. **Parcialmente shipped**: conexión NWC + zaps a usuarios están vivos; emoji zaps y leaderboards quedan pendientes. Guía: [docs/bitcoin-zaps-nwc.md](docs/bitcoin-zaps-nwc.md).

### Wallet
- [x] Wallet Lightning integrada por usuario (una sola wallet para todos los servidores)
- [x] Conectar wallet existente (NWC — Nostr Wallet Connect, NIP-47) — cadena cifrada client-side antes de persistir
- [ ] Balance visible en la UI (sidebar o navbar)
- [ ] Historial de transacciones (zaps enviados/recibidos)

### Zaps entre usuarios
- [x] Zap rapido desde el perfil de un usuario (click en el avatar → zap)
- [x] Zap en mensajes (boton de zap junto a reacciones, `ZapPickerModal`)
- [x] Monto personalizado o presets configurables (ej: 21, 100, 500, 1000 sats)
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

## Fase 8 — Security Audit & Code Quality
> Deep security review del frontend + refactor de calidad de codigo antes del hackathon. Prerequisito para release publica.

### Security testing (frontend)
- [ ] Auditoria de XSS — revisar todo `dangerouslySetInnerHTML`, renderizado de markdown, links en mensajes, bios, nombres de canal/servidor
- [ ] Sanitizacion de contenido de mensajes, emojis custom, attachments, previews de links
- [ ] CSRF / session hijacking — revisar manejo de session tokens, storage, expiracion
- [ ] Validacion de firmas Nostr en cliente y servidor (no confiar en `pubkey` del cliente)
- [ ] Auth bypass — probar acceso a endpoints admin/moderacion sin rol, manipulacion de `serverId` en requests
- [ ] Rate limiting — mensajes, reacciones, uploads, auth challenges
- [ ] Upload de archivos — validar tipo/tamaño server-side, revisar path traversal, SVG con scripts
- [ ] WebSocket — validar auth por conexion, spoofing de eventos, flood protection
- [ ] Dependencias — `npm audit`, Snyk/Socket.dev, revisar paquetes Nostr/NDK
- [ ] Leak de pubkeys/metadata de usuarios privados en respuestas API
- [ ] Content Security Policy (CSP) estricta + headers de seguridad (HSTS, X-Frame-Options, Referrer-Policy)
- [ ] Pentest manual sobre staging — OWASP Top 10 checklist aplicada a chat apps

### Code quality & refactor
- [ ] Identificar codigo duplicado en componentes chat/admin/moderacion y extraer a componentes reutilizables
- [ ] Libreria de componentes UI base (`Button`, `Modal`, `Dialog`, `Input`, `Dropdown`, `Avatar`, `Tooltip`, `Badge`, `Tabs`) con design system La Crypta
- [ ] Consolidar modales de confirmacion (`ConfirmDialog`, `BanReasonDialog`, etc.) en un componente generico
- [ ] Custom hooks reutilizables: `useSocket`, `usePermission`, `useServerRole`, `usePagination`, `useDebounce`
- [ ] Normalizar patrones de fetch — helper unificado con timeout, auth, error handling
- [ ] Tipado estricto — eliminar `any`, habilitar `strict` + `noUncheckedIndexedAccess` en tsconfig
- [ ] ESLint + Prettier config endurecida, pre-commit hooks (husky + lint-staged)
- [ ] Accesibilidad (a11y) — roles ARIA, navegacion por teclado, contraste, screen readers en chat y modales

### Optimizacion & Performance
- [ ] Lazy loading de rutas — `next/dynamic` para `/admin`, `/moderation`, `/profile` y modales pesados
- [ ] Virtualizacion de listas — virtualizar lista de mensajes, miembros y canales para servidores grandes (`react-window` o `@tanstack/virtual`)
- [ ] Bundle analysis — `@next/bundle-analyzer`, identificar y eliminar imports pesados, tree-shake NDK/nostr-tools
- [ ] Optimizacion de imagenes — `next/image` con sizing correcto, lazy loading, formatos WebP/AVIF para avatars y uploads
- [ ] Caching de queries DB — indices en columnas frecuentes (`channelId+createdAt`, `serverId+pubkey`), revisar queries N+1 con Prisma
- [ ] Paginacion de mensajes — cursor-based pagination en lugar de cargar historial completo, infinite scroll eficiente
- [ ] Debounce/throttle — typing indicators, busqueda de usuarios, resize handlers
- [ ] Memoizacion de componentes — `React.memo` / `useMemo` en listas de mensajes, miembros, canales que re-renderizan innecesariamente
- [ ] Compresion de WebSocket payloads — evaluar `perMessageDeflate` en Socket.io para reducir bandwidth
- [ ] Prefetch de datos — prefetch de canales y miembros al seleccionar servidor, prefetch de perfiles Nostr frecuentes
- [ ] Service Worker — cache de assets estaticos, offline fallback para UI shell

### Documentacion
- [ ] `docs/security.md` — modelo de amenazas, mitigaciones, reportar vulnerabilidades
- [ ] `docs/components.md` — catalogo de componentes reutilizables con props y ejemplos
- [ ] `docs/architecture.md` — diagrama de auth flow, data flow, socket.io events
- [ ] `CONTRIBUTING.md` — guia de setup, convenciones de codigo, PR checklist
- [ ] JSDoc / TSDoc en componentes publicos, hooks y lib functions
- [ ] Storybook (o Ladle) para componentes reutilizables — opcional pero recomendado

## Known Bugs
- [ ] Online users not updating — all users appear as online regardless of actual status
- [ ] No way to delete servers from /admin — created servers cannot be removed
- [x] Server creation UI visible to all users — fixed: instance owner or existing owners only
- [x] WoT bypass on signup — fixed: login no longer auto-joins; `/api/servers/[id]/join` enforces WoT
- [ ] Lateral member list does not update per server — debe reflejar los miembros del servidor que el usuario esta viendo actualmente (cambiar de servidor debe re-cargar la lista de miembros, roles y estado online correspondientes)
- [ ] **Nuevo miembro no aparece en tiempo real en la member list de los demás** — cuando Bob se une a un server donde Alice ya está conectada, Alice no ve a Bob en el sidebar hasta que recarga la página (o hasta que Bob manda un mensaje regular, que embeba su profile en el payload del `new-message`). Falta emitir un evento `member-joined` desde `server.ts` al crear la Member row (join route + invitations route) con `{ pubkey, displayName, picture, nip05, role }`, y un listener en `src/app/chat/page.tsx` que lo añada a `memberList` + `profileCache`. Debe filtrarse por `serverId` para no contaminar otros servers donde Alice también esté.
- [ ] **MessageBubble ignora el `message.author` embebido** — `src/components/chat/MessageArea.tsx:213-214` resuelve el avatar/nombre sólo vía `profileCache.get(authorPubkey)`, desperdiciando el perfil que el server ya adjunta en cada emit de `new-message` (ver `getAuthorProfile` en `src/lib/profile-sync.ts:255`). El primer mensaje de un usuario jamás visto renderiza con la letra de fallback hasta que el seed de `chat/page.tsx:426-445` llega al cache y se dispara un re-render. Fix: cadena de prioridad `message.author?.picture ?? profileCache.get(pk)?.picture` (y lo mismo para `displayName`), para que el primer render ya tenga los datos correctos sin depender del seed racing contra `addMessage`.
- [ ] **Mentions autocomplete leaks private/hidden channel membership** — el buscador de menciones (`@user`) debe filtrar los resultados al conjunto de usuarios que realmente pueden leer el canal actual. En canales privados/ocultos, sólo deben aparecer miembros con permiso de lectura sobre ese canal (respetando role-gating y overrides por canal); de lo contrario se filtra indirectamente quién tiene acceso y se generan menciones que el target no puede ver.
- [ ] **Bot role priority en la member list no se puede reordenar** — la posición de los bots en el sidebar depende del orden de sus roles, pero en `/admin` → Roles no se puede mover el orden/priority de los roles de bots (drag-and-drop o up/down), así que quedan agrupados en una posición fija e incorrecta. Fix: exponer el reordenamiento de roles (incluyendo los asignados a bots) en el admin de Roles, persistir `position` y que la member list respete ese orden al agrupar/sortear bots.
- [ ] **Channel load restores `lastSeen` even when not needed** — `src/app/chat/page.tsx:403-418` always queues a pending highlight from `localStorage['chat:lastSeen:<channelId>']` on initial mount. If that message isn't in the latest page, `fetchMessages` refetches with `?around=<id>` (line 1192) and the user lands in old history instead of at the bottom. Should only restore when there is a URL `?m=` param, or fall back to latest page when the stored id is outside it.
- [ ] **UserPanel ↔ MessageInput altura/alineación visual** — la barra de perfil (abajo del ChannelSidebar) no queda perfectamente alineada en altura con la barra de input de mensajes (`px-2 md:px-4 pb-3 md:pb-4 pt-2` en ambos, avatar h-8 vs textarea rows=1). Intentos: `leading-tight` en el stack de texto, mover UserPanel dentro/fuera del aside, `bg-lc-dark` en el wrapper — ninguno cuadra sin introducir una franja negra entre la lista de canales y el card de perfil. Fix pendiente: forzar altura explícita compartida (p.ej. `h-12`) en ambos contenedores internos y asegurar que el wrapper del UserPanel herede el `bg-lc-dark` del aside sin pintar debajo del ServerBar.
- [ ] **Deployed La Crypta server is behind `prisma/seed.ts`** — el contenido inicial de canales (mensaje de bienvenida en `empezá-acá`, posts del foro `indice` con reglas/actividades/proyectos/redes, posts del foro `méritos` con plantillas de reclamo, descripciones, emojis, tags) está hardcoded en el seeder y solo se aplica en la creación inicial del server. La instancia deployed nunca recibe los updates posteriores del seeder, y los admins no tienen forma de editar ese contenido desde la UI. Fix tracked en Fase 1.5: **"Pinned messages + contenido editable de canales desde /admin (paridad con `prisma/seed.ts`)"**, incluye migración one-shot que mueve todo lo seeded a la DB como pinned messages / forum posts editables.

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

## Known bugs / tech debt

- [ ] **Channel emoji should be part of the channel name, not a separate
      field.** Currently `Channel.name` and `Channel.emoji` are stored
      independently in the admin panel, which forces every renderer to stitch
      them back together (`<ChannelEmoji value={channel.emoji} /> {channel.name}`)
      and complicates slugs, share-links, and mentions. Migrate the admin UX
      so the emoji is typed as part of the single name input (e.g.
      `💬 chat-general`), store it inline in `name`, and drop the separate
      `emoji` column in a follow-up migration.
- [ ] scroll to last message button for when where are a lot of messages
- [ ] button to scroll between mentions for when there are multiple mentions to the user in a chat, marking just those mentiosn as read and not so if the user did not finish reading, it does not mark completely read.
- [ ] replies don't allow clicking and navigating to the message that is being replied, also they are showing mentions as npub:kjasdlfj instead of rendering the name of the mentioned account, though not make it clickable
- [ ] forum channels still look like they are the opened tab even after clicking other channels outside, this does not happen clicking between normal channels
- [ ] there is a bug for when a person enters and does not belong to any server, the name on his client says "anonymus" even if it has profile picture and name on nostr metadata already, the same appears on the /admin pannel it does not render the profile picture if the person is not on a server already, there is something wrong
- [ ] at least bienvenida channel renders bad when refreshing the page, loading everything in a disordered way
- [ ] for the purgatorio there has to be a way to block a user from all the channels except a few channels with given roles
- [ ] the counter on the favicon is counting messages that or one don't exist and are already read, or don't belong to channels of the user