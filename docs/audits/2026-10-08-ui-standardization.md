# Shared UI audit, 2026-10-08

This follow-up covers shared controls, repeated sections/cards and guard coverage on top of the clean-code audit (`decf8f82`). The initial inventory found 247 native button openings outside the UI kit, two composer textareas and repeated feature-local section/panel chrome. The existing route guard excluded mobile entirely.

## Changes

- All 247 feature/route buttons now compose the shared `Button`; the UI kit's sheet `FormActions` button also composes it. Explicit submission, handlers, refs, disabled states, accessible labels and data attributes remain intact. Phone action, cancel, destructive, icon and settings-row recipes are named variants. Existing compound controls retain their feature geometry through `bare`, which supplies keyboard focus and a safe default button type without competing padding or opacity.
- Both composer textareas use `TextArea`, preserving desktop resizing, mobile 16px typography, selection refs and fixed-height behavior. Existing inputs/selects already use shared primitives.
- Shared `Section` replaces media-kit/help wrappers (16 rendered sections) and eight mobile settings sections. Settings titles are semantic headings. Shared `Panel`, built from `Card`, `Row` and `Heading`, replaces the widget-specific panel wrapper for four widgets. Eight repeated desktop settings surfaces use `Card`; its surface and border-tone variants own those recipes.
- Removed three feature-local chrome wrappers. Exported the new layout primitives through the layout barrel. Documented primitive selection and when structural divs remain appropriate.
- Button guards now require zero native buttons outside UI, including mobile and development routes. The form guard also enforces zero native input/select/textarea controls outside UI. No new allowlist or debt baseline was introduced.

## Review and verification

The controls received a separate read-only regression review comparing all 248 migrated native button openings, including the UI form action. It found no lost event/disabled/ref/submit props or conflicting native attributes. Lint caught seven import insertions before client directives; those were corrected before integration. Style tests now assert the required state classes while allowing the shared keyboard-focus classes. Existing behavior assertions remain.

The first audit's integrated full suite passed 1,171 files / 7,463 tests. Before integration, UI typecheck and changed-file ESLint passed without diagnostics; repository-wide lint exited successfully with 57 existing warnings in untouched files. Related tests passed 241 files / 1,859 tests, final primitive checks passed 2 files / 46 tests, and structural guards passed 33 files / 227 tests. Source-byte and diff whitespace checks passed. A second independent review confirmed client directives, mobile section semantics, preserved attributes and guard coverage.

## Deliberate boundaries

Unique structural divs, semantic MDX elements and specialized feature geometry remain local. Turning every tag into a thin component would obscure responsibilities. Shared controls centralize behavior and shared recipes; compound game/media/navigation controls still own their bespoke layout. This is a structural and regression-test audit, not a browser screenshot comparison or an exhaustive accessibility review. Release builds, SEO crawls and end-to-end runs remain reserved for release work under repository instructions.
