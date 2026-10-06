# Desktop fork review context

<!-- SPDX-FileCopyrightText: 2026 Fork contributors -->
<!-- SPDX-License-Identifier: MIT -->

## Identity and pins

- Fork: `Art-of-Technology/talk-desktop`; desktop upstream: `nextcloud/talk-desktop`.
- Bundled frontend source: `nextcloud/spreed`; packaged frontend is the npm Git dependency from `nextcloud-releases/spreed`. The old `scripts/update-built-in-talk.mjs` no longer exists.
- These are separate histories and upgrade decisions. A frontend release is not a desktop release or authorization to update the server.
- The original fork point is desktop v2.3.2 (`0119026681ce60ee42f7f63abc286c6114044cd8`), then frontend source v25.0.0 (`57912db53daa69306cdc3bd99cce0615f0dbeb5a`). The combined candidate integrates desktop through `f45e9bcba5ce1c5c669fec52b565393f0b49c0a2` and frontend release v25.0.3 (`3c8cd64865fb05a257fc43404dc281ba333427fa` in the release repository). Verify ancestry and actual resolved sources; source and release repository SHAs are not interchangeable.
- Fork version remains 2.3.5. The `talk.stable` / `talk.beta` / `talk.dev` configuration was replaced by `dependencies.talk`. Read package and lock values rather than treating these observations as permanent pins.
- `build/resolveBuildConfig.js` prefers `TALK_PATH` or an existing `spreed/` checkout, otherwise installed `node_modules/talk`. Record the resolved path/version and lock revision; an old checkout can silently override the dependency. For an override, record its HEAD, dirty state and dependency lock independently.
- Node/npm requirements live in `package.json` (currently Node 24/npm 11). Electron/Forge versions and overrides need their own security and build assessment.

## Integration branch and privacy

- `main` is the intended fork integration target. At policy creation, `custom/notification-sound` carries the customized release work; the locally visible origin branch is that branch.
- Verify remote default branch, available refs, ancestry and release-containing branch at runtime. Record discrepancies; do not silently select an upstream default branch or change branches to resolve them.
- Keep assessment relative to the actual fork commit and separately identify the proposed integration target. A stale/missing main branch is a planning issue, not permission to move release work.
- Preserve ignored `.overrides/build.config.json`, private signing material and local deployment profiles. Reports must not include private names, domains, tokens, screenshots or feed destinations.

## Customized surfaces and regression obligations

| Surface and source pointers | Required review and acceptance evidence |
| --- | --- |
| Message audio: `sounds/notification.ogg`, its license, renderer notifications service/store, `scripts/verify-custom-package.cjs` | Preserve replacement provenance/hash, original call sound, mute/DND and one banner plus one sound. Verify actual packaged assets; audible authenticated delivery needs manual testing. |
| Separate call renderer: `src/talk/CallWindowManager.js`, `src/talk/renderer/CallWindow/`, `webpack.renderer.config.js` | Review upstream import paths, participants/calls wrappers and `callButtons.loader.cjs` script-setup callback guards. Preserve one call owner, media continuity, silent joins, explicit leave versus breakout/reconnect, chat navigation, unique Electron window names, tray behavior, graceful logout/restart and main-window-only notifications/badges. |
| Media cleanup: `CallWindow/idempotentLeave.loader.cjs` | Expected upstream implementation changes must fail visibly. Review cleanup semantics, not just whether the loader still matches. Test capture shutdown, reconnect and breakout transfer. |
| Conversation token: `src/talk/renderer/ConversationSettings/BasicInfoWithIdentifier.vue` and webpack replacement | Preserve read-only conversation token (not numeric room ID), copy success/failure and selectable fallback. Confirm upstream BasicInfo import/context still matches and authenticated rendering works. |
| Action integration: `src/talk/renderer/EdisonActions/`, `src/preload.js` | Preserve account/server/conversation context, stale response handling and action feedback. Review HTTPS URL validation, allowed endpoints/body fields, main-process authentication and IPC boundaries; never expose credentials to the renderer. |
| Updates: `src/app/DesktopUpdater.js`, `ReleaseManifest.js`, `UpdateNotification.js`, `MandatoryUpdateShutdown.js`, renderer `updates/`, preload | Preserve configured fork feed only, optional-update consent before native download, separate restart choice, call protection for optional updates, persistent approved mandatory deadline, first-launch notes and acknowledgement. Qualify old-client bootstrap separately. |
| Release authoring: `scripts/release-authoring.cjs`, `scripts/stage-desktop-update.cjs`, `docs/release-publication.md` | Preserve digest-bound human approval, immutable versioned packages/notes, manifest validation and private approval artifacts. No review grants publication or mandatory-update approval. |
| Packaging and identity: `build/resolveBuildConfig.js`, `build/build.config.json`, `forge.config.js`, webpack configs | Preserve ignored profile resolution, stable deployment identity across upgrades, domain enforcement, assets and signing boundaries. Check frontend/server compatibility and Nextcloud style resources when changing pins. |

## Checks to propose after authorized implementation

A recommendation-only review records available evidence; it does not claim these checks ran.

- Use `npx eslint <changed paths>` without `--fix` for read-only validation (`npm run lint` currently mutates files), plus `npm run ts:check` with installed dependencies and the pinned frontend.
- Run relevant Node suites: `scripts/test-call-window-manager.cjs`, `scripts/test-talk-window-identity.cjs`, `CallWindow/callWindowActions.test.mjs`, `CallWindow/idempotentLeave.test.cjs`, `CallWindow/callButtons.test.cjs`, `scripts/test-edison-transport.mjs`, and `EdisonActions/actionWidget.test.mjs` (renderer paths are under `src/talk/renderer/`).
- Discover and run affected updater/release suites under `scripts/test-*`: desktop-updater, update-preload, update-notification, update-notice, update-notice-component, release-authoring, release-io and stage-desktop-update. Use `node --test` with explicit paths.
- Windows: with prerequisites installed, set `CHANNEL=stable`, run the requested architecture's build/package scripts, verify the resulting `app.asar` with `scripts/verify-custom-package.cjs`, and perform packaged startup. Windows x64 commands are documented in `CUSTOMIZATION.md`.
- Windows Electron smoke: `node_modules/electron/dist/electron.exe scripts/smoke-call-window.cjs` uses synthetic media and a temporary profile. It does not prove live microphone, camera, screen sharing or authenticated notification delivery.
- macOS: shared static/Node checks are not native qualification. Build/package on a Mac for the requested arm64/x64/universal target, verify audio/assets and identity, then test launch, signing/notarization, installation, permissions and updater behavior there. No Mac artifact is established by Windows results.
- On each supported platform, perform authenticated clipboard and notification tests, two-participant call/media tests, reconnect/breakout tests, and release-flow qualification appropriate to the changed surfaces. Record unperformed checks explicitly.

Read `CUSTOMIZATION.md` and `AGENTS.md` for the complete acceptance and publication rules. Re-inspect these source paths after upstream changes; this map is a starting point, not an exhaustive dependency graph.
