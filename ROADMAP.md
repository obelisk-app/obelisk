# Obelisk — Roadmap

## Fase 0 — Fundacion (lo que ya existe)
- [x] Login con NIP-07, nsec, NIP-46
- [x] Perfil de Nostr (avatar, banner, bio, NIP-05)
- [x] Design system La Crypta
- [x] Relay management

## Fase 0.5 — Landing Page
- [ ] Landing page con branding del proyecto
- [ ] i18n (ES/EN) — todo el sitio bilingue
- [ ] Secciones: hero, features, how it works, CTA (login/register)
- [ ] Design badass — dark theme, animaciones, glows, glassmorphism, La Crypta aesthetic
- [ ] Responsive (mobile/desktop)

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
- [ ] Panel de admin (/admin) — miembros, configuracion, bans
- [ ] Sistema de roles (owner/admin/mod/member) con jerarquia
- [ ] Moderacion (/moderation) — reportes, mutes, warnings, audit log
- [ ] CRUD de canales y categorias (admin)
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
- [ ] Canales de voz (via [HiveTalk SFU](https://github.com/HiveTalk/hivetalksfu) — WebRTC SFU self-hosted)
- [ ] Sistema de invitaciones (links de un uso / por npub) — anti-spam
- [ ] Menciones (@usuario) resueltas desde Nostr profiles
- [ ] Multi-server (crear/unirse a varios servidores)
- [ ] DMs via Nostr relays (encrypt/decrypt con el signer del usuario, NIP-04/NIP-17)

## Fase 3 — Features Avanzados
- [ ] Perfiles de app (avatar, bio, display name — datos propios, no de Nostr)
- [ ] Exportar conversaciones (JSON / texto plano)
- [ ] Bots / integraciones
- [x] Busqueda de mensajes (Discord-style: from:, in:, has:, before:, after:, mentions:, "exact phrases")
- [ ] Upload de archivos/media (almacenado en el servidor del host)

## Fase 4 — Polish & Launch
- [ ] PWA (Progressive Web App) — installable, offline support, service worker
- [ ] Notificaciones (push / in-app)
- [ ] Temas personalizados por servidor
- [ ] Mobile responsive
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

## Fase 6 — Obelisk Lite (Web + Mobile)
> Una app nueva, simple, zero learning curve — misma red, misma gente, otra experiencia.

Despues de completar la experiencia Discord-like (Fases 1-5), construir un cliente alternativo pensado para usuarios no-tecnicos. Intercompatible al 100% con Obelisk: mismos servidores, canales, mensajes, miembros.

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

## Test Suite (continuo)
> No mocks. Tests reales contra infraestructura real.

- [ ] Setup: Vitest/Jest + Playwright (e2e) + test DB (SQLite en memoria)
- [ ] Auth tests: Login real con nsec/npub generados, firma de challenges, verificacion de sesion
- [ ] Channel tests: CRUD canales, permisos, orden
- [ ] Message tests: Envio, recepcion via WebSocket, threads, historial, paginacion
- [ ] Multimedia tests: Upload, preview, limites de tamano, tipos permitidos
- [ ] DM tests: Encrypt/decrypt real con keypairs de test via relays de test
- [ ] WebSocket tests: Conexion, reconexion, multiples clientes simultaneos, broadcast
- [ ] Members tests: Join, leave, roles, permisos por rol
- [ ] E2E flows: Usuario se registra -> entra a canal -> manda mensaje -> otro usuario lo ve
- [ ] Load tests: Multiples usuarios concurrentes, flood de mensajes
- [ ] i18n tests: Todas las strings en ES y EN presentes y correctas
- [ ] CI pipeline: tests corren en cada PR
