import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Directories whose <img> elements render media chosen by Nostr event
// authors: avatars, stickers, custom emoji, message images, link-preview
// thumbnails. See the no-img-element override below.
const EVENT_MEDIA_DIRS = [
  "src/components/chat/**",
  "src/components/social/**",
  "src/components/media/**",
  "src/app/[locale]/app/**",
];

// Tests live in tests/ (vitest.config.ts also collects scripts/**/*.test.ts).
// A `**/__tests__/**` glob used to sit here; no such folder exists, and
// tests/eslint-config.test.ts now fails on any path-scoped glob that matches
// nothing, so it went.
const TEST_FILES = ["**/*.test.ts", "**/*.test.tsx", "tests/**"];

// The owner's rule: a source file stays at about 300 lines. Blank lines and
// comment-only lines do not count, so a well-explained file is not punished
// for its explanations.
const MAX_LINES = ["error", { max: 300, skipBlankLines: true, skipComments: true }];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    name: "obelisk/rules",
    rules: {
      // The codebase marks deliberately-unused bindings with a leading
      // underscore (mock parameters, placeholder props). Honour that
      // convention instead of flagging ~50 intentional sites.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],

      // The react-hooks v7 family is an error. Per
      // audits/obelisk/round6/DECISION-lint.md every hit is a genuine
      // finding to be read and fixed by hand, never bulk-fixed or
      // suppressed; the handful left on purpose carry a per-line
      // `eslint-disable-next-line` with the reason beside the code
      // (round 9). `exhaustive-deps` ships as `warn` upstream and is
      // promoted here because it hides stale closures and is at zero in
      // src/app, src/components and src/hooks. The one directory-scoped
      // `warn` left is the override block below for files other owners are
      // still working in.
      "react-hooks/set-state-in-effect": "error",
      "react-hooks/refs": "error",
      "react-hooks/use-memo": "error",
      "react-hooks/exhaustive-deps": "error",

      // Upstream ships this as `warn`, which cannot fail CI. Outside the
      // event-media directories below every <img> is either a next/image or
      // carries a one-line justified disable, so a new raw <img> on a
      // marketing page is a real regression and should fail the build.
      "@next/next/no-img-element": "error",
    },
  },
  {
    // Test doubles deliberately model partial shapes, so `any` in a test is
    // a different thing from `any` in shipped code. This repo's real test
    // typing problem is the opposite one: ~60 hand-rolled bridge mocks, only
    // one of them type-checked. Forcing `any` out of test files by hand
    // produces worse mocks, not better ones. The honest fix is a single
    // shared `satisfies`-checked bridge mock factory, which is a design task
    // tracked separately (DECISION-lint.md, section 1). Shipped source keeps
    // the rule at `error`.
    name: "obelisk/tests",
    files: TEST_FILES,
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    // TEMPORARY (opened 2026-10-05 in round 9, recounted 2026-10-06 in round
    // 17): the react-hooks family stays `warn`, not `error`, in the files
    // below only, because each still has hits and turning them into errors
    // would break CI before the people fixing them are done. Every hit is a
    // real finding to read and fix by hand (DECISION-lint.md), never to
    // suppress in bulk.
    //
    // Count on 2026-10-06 (`npx eslint .`, round 17): 4 warnings in 3 files,
    // all inside the bridge folder:
    //   src/services/nostr-bridge/hooks/messages.ts 2, groups.ts 1,
    //     session.ts 1 (audit/r16-bridge's folder this round, but not on its
    //     list of fixes).
    // Came off in round 17 (audit/r17-hooks), fixed by hand when the hooks
    // moved out of src/services into src/hooks: the operator-data hooks
    // (channel layout, operator pubkey, branding, roles; one real bug: right
    // after a relay switch they subscribed the new relay's data with the old
    // relay's operator as its author) and the social hooks (useFeed,
    // useSocialProfile, useNotePreview; the last two painted the previous
    // author or note for one render).
    // src/components/voice/** and the two voice/search hooks came off in
    // round 16 when audit/r16-comp fixed their 16 hits (three were real bugs).
    // `src/lib/**` was on this list until round 16. No file under src/lib has
    // had a hit since round 15 moved the React code out, so it came off: a
    // hook added there now fails lint like anywhere else.
    //
    // When it can go: when `npx eslint .` shows zero `react-hooks/*`
    // warnings. Delete this whole block then, not a line of it. Removing one
    // file early is fine once that file reaches zero.
    // tests/eslint-config.test.ts checks every path below still exists, so a
    // move cannot leave an entry that silently matches nothing.
    name: "obelisk/react-hooks-temporary-warn",
    files: [
      "src/services/nostr-bridge/hooks/groups.ts",
      "src/services/nostr-bridge/hooks/messages.ts",
      ],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/use-memo": "warn",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // `next/image` is the wrong tool for media chosen by Nostr event authors,
    // and not merely inconvenient: it would route arbitrary sender-chosen
    // URLs through this app's own image optimizer, which is an SSRF surface
    // and reintroduces the referrer leak that round 5 closed with
    // `referrerPolicy="no-referrer"` and click-to-load gating. A raw <img>
    // behind the media gate is the deliberate, correct choice in these
    // directories. The rule stays on everywhere else so the marketing pages
    // (LandingPage, MediaKit, Showcase, features, r/[code]) keep using
    // next/image for first-party, build-time-known assets.
    name: "obelisk/event-media-img",
    files: EVENT_MEDIA_DIRS,
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
  {
    // Node-only maintenance scripts. `rules-of-hooks` misreads
    // nostr-tools' `useWebSocketImplementation()` as a React hook; there is
    // no React in this directory.
    name: "obelisk/scripts",
    files: ["scripts/**"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
  {
    // URL locales: `/app` written in a Spanish page must land on `/es/app`,
    // which only next-intl's wrappers do. Every internal link, router call
    // and redirect goes through `@/i18n/navigation`; the raw Next ones are
    // banned outside the folder that wraps them. `notFound`, `useParams`
    // and `useSearchParams` carry no locale and stay allowed.
    name: "obelisk/locale-aware-navigation",
    files: ["src/**"],
    ignores: ["src/i18n/**"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [
          { name: "next/link", message: "Use Link from '@/i18n/navigation' so the href keeps the reader's language." },
          {
            name: "next/navigation",
            importNames: ["useRouter", "usePathname", "redirect", "permanentRedirect"],
            message: "Use the locale-aware versions from '@/i18n/navigation'.",
          },
        ],
      }],
    },
  },
  {
    // The owner's 300-line rule, enforced. See MAX_LINES above.
    name: "obelisk/max-lines",
    files: ["src/**"],
    rules: {
      "max-lines": MAX_LINES,
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Git worktrees live inside the repo per AGENTS.md and each carries its own
    // node_modules. Linting into them pulls a second copy of @types/react and
    // reports tens of thousands of phantom problems.
    "worktrees/**",
  ]),
]);

export default eslintConfig;
