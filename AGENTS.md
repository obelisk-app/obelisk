# AGENTS.md — Nostr Starter Kit for Identity Hackathon

You are helping a participant of La Crypta's **IDENTITY Hackathon** (April 2026).
Your goal: help them build a winning Nostr Identity app using this starter kit.

## Hackathon Context
- **Theme:** IDENTITY — Nostr Identity & Social
- **Organizer:** La Crypta (lacrypta.ar) — Argentine Bitcoin & Nostr community
- **Level:** Beginner-friendly, but winning projects show creativity and polish
- **Registration:** https://tally.so/r/9qDNEY
- **Community:** Discord La Crypta

## What Judges Look For
1. **Identity innovation** — creative use of Nostr identity primitives (keys, profiles, NIP-05, badges, delegation)
2. **Working demo** — it must run and be interactive
3. **UX polish** — La Crypta look and feel is already applied (dark theme, green accents, skeleton loading)
4. **Protocol understanding** — proper use of NIPs, relay management, event kinds
5. **Completeness** — a focused, finished feature beats many half-done ones

## Stack
- **Next.js 16** + TypeScript + Tailwind CSS v4
- **NDK** (Nostr Dev Kit v3) — high-level Nostr abstraction
- **Zustand** — lightweight state management
- **nostr-tools** — low-level Nostr utilities
- **qrcode.react** — QR code generation for NIP-46 bunker flow
- **Vitest** + **React Testing Library** — component and unit testing

## Project Structure
```
src/
├── app/
│   ├── layout.tsx        # Root layout (Inter font, La Crypta theme)
│   ├── page.tsx          # Main page — renders active section (Profile/Badges)
│   └── globals.css       # La Crypta design system (colors, skeletons, animations)
├── components/
│   ├── Navbar.tsx        # Fixed nav with section links (Profile, Badges) + user menu
│   ├── LoginModal.tsx    # Modal with 3 auth methods + QR bunker flow
│   ├── Profile.tsx       # User profile with skeleton loading
│   └── Badges.tsx        # NIP-58 badges display with skeleton loading
├── lib/
│   └── nostr.ts          # NDK setup, login, relay mgmt, data fetching (all with timeouts)
├── store/
│   ├── auth.ts           # Auth state (Zustand + localStorage persistence)
│   └── nav.ts            # Navigation state (active section)
└── types/
    └── nostr.d.ts        # NIP-07 window.nostr type declarations
```

## Commands
```bash
npm install          # Install dependencies
npm run dev          # Dev server at localhost:3000
npm run build        # Production build
npm run test         # Run all tests once
npm run test:watch   # Run tests in watch mode (re-runs on file changes)
npm run test:coverage # Run tests with coverage report
```

## What's Already Built
- **3 login methods:** NIP-07 extension (auto-detected), nsec, NIP-46 bunker with QR code
- **Profile view:** Avatar, banner, bio, NIP-05 verification, website, lightning address
- **Social stats:** Followers, following, notes count (all with timeouts)
- **Notes timeline:** User's kind-1 notes with relative timestamps
- **Badges page:** NIP-58 badge awards display
- **Smart relay management:** Combines 5 popular relays + user's NIP-65 relay list (kind 10002)
- **Skeleton loading:** Animated placeholders for all loading states
- **Image loading:** Shimmer effect until images fully load
- **La Crypta design system:** Dark theme, green accents (#b4f953), grid background, pill buttons, card hover effects

## Design System (La Crypta)
The UI follows lacrypta.ar's visual language:
- **Background:** `lc-black` (#0a0a0a) with subtle grid pattern
- **Cards:** `lc-dark` (#171717) with `lc-border` (#262626), 12px radius
- **Accent:** `lc-green` (#b4f953) — lime green for active states, CTAs, verification
- **Text:** `lc-white` (#fafafa), `lc-muted` (#a3a3a3)
- **Buttons:** Pill-shaped (9999px radius) — `lc-pill-primary` (green) / `lc-pill-secondary` (dark)
- **CSS classes:** `lc-card`, `lc-glow`, `lc-spinner`, `lc-skeleton`, `lc-img-skeleton`

## Key NIPs to Know
These are the Nostr protocol specs most relevant to the IDENTITY theme:

| NIP | What | Kind | Status in App |
|-----|------|------|---------------|
| NIP-01 | Basic events & profiles | 0, 1 | ✅ Implemented |
| NIP-02 | Contact list (follows) | 3 | ✅ Implemented |
| NIP-05 | DNS-based verification | - | ✅ Display only |
| NIP-07 | Browser extension signer | - | ✅ Implemented |
| NIP-46 | Nostr Connect (bunker) | 24133 | ✅ Implemented with QR |
| NIP-58 | Badges | 30009, 8 | ✅ Display only |
| NIP-65 | Relay list metadata | 10002 | ✅ Auto-fetched |
| NIP-04 | Encrypted DMs | 4 | ❌ Not yet |
| NIP-17 | Private DMs (modern) | 1059 | ❌ Not yet |
| NIP-57 | Zaps (Lightning tips) | 9735 | ❌ Not yet |
| NIP-09 | Event deletion | 5 | ❌ Not yet |
| NIP-25 | Reactions (likes) | 7 | ❌ Not yet |
| NIP-26 | Delegated event signing | - | ❌ Not yet |
| NIP-39 | External identities | - | ❌ Not yet |

## Winning Ideas (Identity Theme)
These are high-impact features a participant could build to win. Suggest the one that fits their skill level:

### Beginner-Friendly
1. **Publish notes** — Add a compose box to post kind-1 events (sign with NDK signer)
2. **Edit profile** — Form to update kind-0 metadata (name, about, picture, NIP-05)
3. **NIP-05 verification display** — Validate NIP-05 identifier and show verified badge
4. **Follow/unfollow** — Update kind-3 contact list
5. **View other profiles** — Click on a pubkey/npub to see another user's profile

### Intermediate
6. **Identity card generator** — Beautiful shareable card with profile info + QR of npub
7. **Badge issuer** — Create and award NIP-58 badges to other users
8. **Reactions (likes)** — Send kind-7 reactions to notes
9. **Reposts** — Kind-6 repost functionality
10. **Thread view** — Follow reply chains using NIP-10 markers

### Advanced (Likely Winners)
11. **NIP-05 verification service** — User registers their NIP-05 via the app
12. **Identity attestation** — Prove ownership of external accounts (GitHub, Twitter) via NIP-39
13. **Delegated signing** — NIP-26 delegation for team/org accounts
14. **Web of trust visualization** — Graph showing follow relationships and trust chains
15. **Encrypted DMs** — NIP-17 private messaging with identity verification
16. **Multi-identity manager** — Switch between multiple Nostr identities
17. **Identity recovery flow** — Social recovery using trusted contacts

## Testing

### Stack
- **Vitest** — fast test runner built on Vite, recommended for Next.js
- **React Testing Library** — DOM-based component testing (renders like a real user sees it)
- **jsdom** — browser environment simulation for Node.js

### Setup (one-time)
If not already installed, run:
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @vitejs/plugin-react jsdom
```

The project includes a `vitest.config.ts` at the root:
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

And a setup file at `src/test/setup.ts`:
```typescript
import '@testing-library/jest-dom/vitest';
```

### File Conventions
- **Co-located tests:** Place test files next to the source file they test
  - `src/components/Profile.tsx` → `src/components/Profile.test.tsx`
  - `src/lib/nostr.ts` → `src/lib/nostr.test.ts`
  - `src/store/auth.ts` → `src/store/auth.test.ts`
- **File naming:** Always use `.test.ts` for logic or `.test.tsx` for components
- **Test helpers:** Place shared mocks and test utilities in `src/test/`

### What to Test for Each Feature Type

#### Components (`.tsx`)
- Renders without crashing
- Displays skeleton loading state when data is loading
- Renders correct content when data is available
- User interactions (clicks, form submissions) trigger expected behavior
- Conditional rendering (logged in vs. logged out, empty states)

#### Stores (Zustand)
- Initial state is correct
- Actions update state as expected
- Persistence (localStorage) works if applicable

#### Library functions (`lib/`)
- Pure functions return expected outputs
- Async functions handle timeouts and errors
- NDK interactions use mocked NDK instances

### Writing Tests — Patterns

#### Component test example:
```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { MyComponent } from './MyComponent';

// Mock NDK or stores as needed
vi.mock('@/lib/nostr', () => ({
  getNDK: vi.fn(() => mockNDK),
  connectNDK: vi.fn(),
}));

describe('MyComponent', () => {
  it('renders skeleton while loading', () => {
    render(<MyComponent />);
    expect(screen.getByTestId('skeleton')).toBeInTheDocument();
  });

  it('renders profile data when loaded', async () => {
    render(<MyComponent pubkey="abc123" />);
    expect(await screen.findByText('Alice')).toBeInTheDocument();
  });

  it('handles button click', async () => {
    const user = userEvent.setup();
    render(<MyComponent />);
    await user.click(screen.getByRole('button', { name: /follow/i }));
    expect(mockPublish).toHaveBeenCalled();
  });
});
```

#### Zustand store test example:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './auth';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState(useAuthStore.getInitialState());
  });

  it('starts logged out', () => {
    expect(useAuthStore.getState().pubkey).toBeNull();
  });

  it('sets pubkey on login', () => {
    useAuthStore.getState().login('abc123');
    expect(useAuthStore.getState().pubkey).toBe('abc123');
  });
});
```

#### Mocking NDK:
```typescript
// src/test/mocks/ndk.ts
import { vi } from 'vitest';

export const mockNDK = {
  connect: vi.fn(),
  fetchEvents: vi.fn().mockResolvedValue(new Set()),
  getUser: vi.fn(() => ({
    pubkey: 'test-pubkey',
    fetchProfile: vi.fn().mockResolvedValue({ name: 'Test User' }),
  })),
  signer: { sign: vi.fn() },
};
```

### Workflow: After Finishing Every Feature

> **CRITICAL — NON-NEGOTIABLE RULE:**
> A feature is **NOT done** until its tests are written, passing, and the full suite runs green.
> Do NOT move on to the next task, do NOT report completion, do NOT ask the user what's next,
> until `npm run test` passes with the new tests included.
> This applies to EVERY change: new components, new stores, new API routes, new lib functions.
> **No exceptions. No "I'll write tests later." Tests are part of the implementation, not an afterthought.**

**Every time you finish implementing or editing a feature, you MUST:**

1. **Create the test file** next to the source file (e.g., `MyComponent.test.tsx`)
2. **Write tests** covering: rendering, loading states, user interactions, edge cases
3. **Run the tests** with `npm run test` and verify they pass
4. **Fix any failures** before considering the feature done
5. **Run the full suite** (`npm run test`) to ensure no regressions
6. **Only THEN** mark the task as complete or move on

> **Rule:** No feature is complete without passing tests. If tests fail, fix the code or the test before moving on. Always run `npm run test` as the final step after any edit.

### Adding `data-testid` Attributes
When creating components, add `data-testid` attributes to key elements for reliable test selectors:
```tsx
<div data-testid="profile-skeleton" className="lc-skeleton" />
<button data-testid="follow-btn">Follow</button>
<div data-testid="badge-list">{/* badges */}</div>
```

## How to Help the Participant

### When they first arrive:
1. Ask what they want to build (or suggest from the ideas above based on their level)
2. Help them run `npm install && npm run dev`
3. Walk them through the existing code structure

### When they're coding:
- Always use NDK for Nostr operations (it's already set up in `src/lib/nostr.ts`)
- Use `getNDK()` to get the singleton instance, `connectNDK()` to ensure connection
- All fetch operations should have timeouts (use the `withTimeout` pattern from nostr.ts)
- Follow the La Crypta design system — use the `lc-*` CSS classes and color tokens
- Add skeleton loading for any new data-fetching component
- Add new sections by: creating a component, adding to `Section` type in `store/nav.ts`, adding nav link in `Navbar.tsx`, rendering in `page.tsx`
- **Always write tests** for new features — create a `.test.tsx` file next to each new component or module, then run `npm run test` to verify (see the Testing section above)

### NDK Quick Reference:
```typescript
import NDK, { NDKEvent, NDKUser } from '@nostr-dev-kit/ndk';
import { getNDK, connectNDK } from '@/lib/nostr';

// Publish an event
const ndk = getNDK();
const event = new NDKEvent(ndk);
event.kind = 1;
event.content = "Hello Nostr!";
await event.publish();

// Fetch events
const events = await ndk.fetchEvents({ kinds: [1], authors: [pubkey], limit: 10 });

// Get a user
const user = ndk.getUser({ pubkey });
await user.fetchProfile();

// Sign with current signer (set during login)
// ndk.signer is already set after login — just publish
```

### Adding a New Section (step by step):
1. Add the section ID to `Section` type in `src/store/nav.ts`
2. Create `src/components/YourSection.tsx` (use `'use client'`, include skeleton)
3. Add nav button in `src/components/Navbar.tsx` (copy existing pattern)
4. Add render case in `src/app/page.tsx`

## Relays
The app auto-manages relays:
- **Default (popular):** relay.damus.io, relay.nostr.band, nos.lol, relay.primal.net, purplepag.es
- **User relays:** Automatically fetched from NIP-65 (kind 10002) on first data load

## Resources
- [NDK Documentation](https://ndk.fyi)
- [Nostr Protocol](https://nostr.com)
- [NIPs Repository](https://github.com/nostr-protocol/nips)
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools)
- [Alby Extension](https://getalby.com)
- [La Crypta](https://lacrypta.ar)
- [Nostr Starter Kit (this repo)](https://github.com/lacrypta/nostr-starter)
