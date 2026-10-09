# Session connection routing

Branch: `fix/session-connection-routing`. Base: `824639f0` on `reorg/pre-launch`. Work remains isolated here; nothing has been merged or pushed, and the canonical development server has not been switched to this branch.

## Changes

- `efef4f82`: central public-key verification for the extension.
- `4307faf3`: fence extension capabilities while identity verification is pending.
- `5df079c0`: react to verified extension account changes through the session lifecycle.
- `a4d0f476`: verify restored identities, handle account changes during startup, refresh current-user profiles, and expose paused signing/recovery in session UI.
- `60c50f9b`: route signer, WoT, PQ, wallet, and zap capabilities through the active session. Implicit WebLN is available only for extension login; configured NWC remains usable with other login methods.
- `0056023c`: share wallet selection policy while keeping the hook subscribed to its mounted session; cover pending identity checks and remote-signer warmup.

## Verification

Final typecheck passed. Full lint had zero errors and 53 warnings; final changed-file lint passed. All 239 architectural guard tests passed. The full test run passed 7,692 tests and failed 10 tests in three WebLN fixture files whose default login method was nsec. Those fixtures now explicitly select nip07. The final rerun of all three affected files plus the wallet hook and signer-routing tests passed all 29 tests. No production build or authenticated browser/signing test was run.

## Remaining

Review/integrate this branch into `reorg/pre-launch` and test extension account switching, reload identity checks, and Nostr Connect isolation against real signers before release. Do not claim it is live or pushed. Do not overwrite other agents' worktrees.

The separate pitch preview is at `/Users/dandelionlabs/development/personal/output/obelisk-call-host-pitch/index.html`, served locally on port 8768. The PDF was intentionally left unchanged pending the user's review of the pitch. Hosting commands and controls in that preview are illustrative, not implemented functionality.
