# UI efficiency and responsive ownership audit

This pass follows the clean-code, shared primitive, and route ownership audits on `reorg/pre-launch`. Independent reviews covered translation payloads, mounted feed work, and the desktop/mobile boundary.

## Translation ownership and payload

Route-family layouts own their translation scopes. Pages retain their substantive server-rendered content. The root provider supplies common messages once; route providers inherit those messages in the browser and add only their own selected modules. Development previews explicitly request a standalone provider. A route change replaces route messages, so previous route modules do not accumulate.

Features and help ship navigation copy only. Guides add video control copy. Showcase pages retain showcase copy for their client UI. Media kit no longer includes unused marketing copy. Server-rendered headings, articles and help content still have access to the complete request locale through server translation APIs.

The guide scope's compact UTF-8 JSON payload changes from 44,212 to 2,519 bytes in English, 48,306 to 2,715 in Spanish, and 48,223 to 2,711 in Portuguese. These figures compare the previous route provider payload with the new route additions; root common messages are present in both designs. This is roughly a 94% reduction in route translation data, not a production bundle or response-size measurement.

Regression checks cover common-message inheritance, locale changes, replacement of route additions, repeated scope declarations, and client-reachable module/subtree availability. Client graph checks distinguish server-rendered content from imports below a client boundary.

## Mounted feed work

Contact-event parsing and the follow membership index are shared across consumers of the same immutable event. This removes repeated parsing and set construction per note row. Media permission consumers select the effective policy result instead of rerendering for every WoT update, and avoid a WoT subscription when the selected policy does not use it.

A lower-priority opportunity remains: note engagement/menu hooks subscribe to whole preference snapshots when they need social relay settings. Unrelated settings changes can still rerender those consumers. This is infrequent user-driven work, unlike feed-sized repeated contact parsing.

## Responsive architecture

`/desktop` and `/mobile` are public showcase pages. The actual application has one `/app` entry point. `AppGate` selects one lazy shell at the shared 1024px breakpoint; it does not mount both shells and hide one with CSS.

The bridge, session and read state already live above the adaptive shells. Channel composition, DM behavior, scroll handling, stores and transport logic are substantially shared. Desktop and mobile render different navigation interactions: desktop uses panes and view state, while mobile uses a carousel, history entries and browser-back behavior.

Background voice playback now also lives above the shell switch. A regression verifies the same audio element and subscription survive both breakpoint crossings, while logout releases them.

Keep the two adaptive navigation renderers within the single responsive app. Further consolidation should start with a shared destination model, then share feature content where the interaction contracts match. Simply combining both shells into one component would retain both navigation models and obscure ownership. Shell-local navigation, pane and composer state can still reset when crossing the breakpoint; URL recovery restores overlapping destinations, not every local state.

## Verification boundary

Each implementation uses targeted tests, typechecking, changed-file lint and structural guards before integration. The coordinator runs the full test suite once after integration. Production builds, bundle measurements and browser release checks are reserved for release verification by repository policy; this audit makes no measured loading-time claim.
