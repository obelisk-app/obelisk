# App-wide i18n + Per-user Language

**Historical record.** This document preserves its original pass, plan or evidence. It is not the current implementation contract. Follow [current architecture](../../architecture/README.md) and [UI conventions](../../ui/conventions.md); source paths and measurements below describe the original work.

**Status:** superseded. App-wide translation shipped differently: next-intl, URL locales (English unprefixed, `/es`, `/pt`), per-module message files under `src/i18n/messages/<locale>/`. The current design is [i18n.md](../../architecture/i18n.md); this plan (one provider with `es.json` / `en.json`, a server-side `User.language`) is kept for history only.

Today only the landing page is translated (ES/EN). The rest of the app (chat, admin, moderation, forums, settings, modals, toasts, API errors) is a mix of hardcoded Spanish and English. Each user should also have their own persisted language, independent of any per-server default.

## Scope: what needs to become translatable

- `src/components/**` - all UI strings (labels, tooltips, placeholders, `aria-label`s, empty states, button text).
- `src/app/**` - page titles, section headings, static copy.
- Toasts + modals (confirmation dialogs, ban reason dialog, etc).
- API error messages returned from `src/app/api/**` (today some errors are produced in Spanish, some in English).
- `data-testid` values stay untouched; only user-visible text moves.

## Infrastructure

Reuse the landing-page i18n provider; do not introduce a second library. Extend its `es.json` / `en.json` with additional namespaces so the dictionary does not become one monolithic file:

- `chat` - channel sidebar, message input, message area, reply UI.
- `admin` - admin panel tabs, forms, modals.
- `moderation` - moderation dashboard, reports, audit log.
- `forum` - forum list + detail.
- `settings` - user settings and preference screens.
- `auth` - login modal, session prompts, signer errors.
- `common` - navbar, user menu, shared buttons.
- `errors` - API error strings keyed by error code.

Migration is incremental by area: chat → admin → moderation → forum → settings → modals/toasts → backend error messages.

## Default language on first login

Detect locale server-side at first login and seed `User.language`.

1. **IP-based country mapping**: resolve country via `CF-IPCountry` header (Cloudflare) or fallback resolver. Map Spanish-speaking countries (`AR`, `ES`, `MX`, `CL`, `UY`, `CO`, `PE`, `BO`, `EC`, `PY`, `VE`, `DO`, `GT`, `HN`, `NI`, `SV`, `CR`, `PA`, `CU`, `PR`) → `es`. Everything else → `en`.
2. **Fallback to `Accept-Language`** if IP country is not resolvable.
3. **Hard default** → `en` if both fail.

Seed once on first `Member`/`User` creation. Subsequent logins do not override.

## Per-user persistence

New column `User.language` (global, not per-server). Rationale: a single user moving across servers should keep their preferred language; per-server language (covered separately in the roadmap) is for system-generated messages, not UI strings.

- Selector in `/settings` (or the user menu) that `PATCH`es the new value and hot-swaps the provider without a reload.
- Precedence: `User.language` overrides any server-level default for UI strings.

## SSR

The root layout reads `User.language` from the session, sets `<html lang>`, and hydrates the i18n provider with the resolved locale. This prevents a flash of wrong language on first paint.

## Tests

- Header-mocked IP-country detection (AR → `es`, US → `en`, unknown → `Accept-Language` fallback).
- `PATCH /api/me/language` persists and returns the updated value.
- Representative components rendered in both locales (no hardcoded strings in migrated files).
- Lint rule or snapshot per locale that fails if a migrated file reintroduces hardcoded user-visible text.
