# Desktop notification sound customization

Originally based on Nextcloud Talk Desktop v2.3.2 (0119026681ce60ee42f7f63abc286c6114044cd8), now integrated with desktop upstream through f45e9bcba5ce1c5c669fec52b565393f0b49c0a2. The frontend is the npm dependency Talk v25.0.3 from nextcloud-releases/spreed, locked at 3c8cd64865fb05a257fc43404dc281ba333427fa.

The bundled message audio is replaced. The official client already uses silent OS banners plus one bundled audio playback. This fork retains that approach, DND/mute preferences and the original call audio; it does not attach custom sound to Windows toast XML.

## Separate call window

Joining a call promotes the existing renderer to a dedicated call window and
opens a fresh main chat window. The call's signaling, camera, microphone and
screen-share objects stay in their original renderer. Use **Open chats** from
the call window or **Return to call** from the main window. The main window can
be closed to the tray without closing the call.

Only one window may own a call. Another join request focuses the existing call
instead of starting a second session. Closing the call window asks to leave;
logout and restart also wait for the normal leave flow. Notifications and badge
updates belong to the main chat window to avoid duplicate desktop alerts.

The integration wraps the pinned Talk modules at build time. The pinned source
checkout is unchanged. These changes affect this desktop build, not the server
web client or native mobile apps. The build-time media cleanup and call-button
patches fail if their expected upstream callbacks change, requiring a review on upgrades.
Talk 25.0.3 uses script-setup call controls; the build patches those callbacks
directly, preserving silent joins and distinguishing explicit leave from
reconnects and breakout transfers. Explicit leave in a promoted voice-room
window completes the same confirmed store leave as native close, then closes
that window without racing a second navigation-triggered leave.

Only the initial primary window persists its geometry. Replacement chat windows
and external windows are unnamed and nonpersistent so they never collide with
the promoted renderer's unique Electron window name.

Local verification commands:

```
node --test scripts/test-call-window-manager.cjs scripts/test-talk-window-identity.cjs
node --test src/talk/renderer/CallWindow/callWindowActions.test.mjs src/talk/renderer/CallWindow/idempotentLeave.test.cjs src/talk/renderer/CallWindow/callButtons.test.cjs
node_modules/electron/dist/electron.exe scripts/smoke-call-window.cjs
npm run ts:check
```

The Electron smoke test uses a fresh temporary profile and a synthetic video
track, without connecting to a server. It verifies renderer/media continuity
across independent main-window navigation; it does not establish live Talk
audio, camera, screen sharing or breakout interoperability. Validate those with
two consenting test participants before distributing widely.

For live acceptance, start a call, switch chats in the main window, retrieve a
file and return to the meeting. Repeat while sharing a screen, while the main
window is minimized to the tray, and when accepting an incoming call. Verify
one notification sound/banner, both Open chats / Return to call buttons, and
that closing the call stops capture while leaving the main app usable. Check
reconnection and breakout transfers separately. If graceful leave times out,
the native dialog offers an explicit local close; the server may not have
acknowledged that departure yet.

## Conversation identifier

Basic Info includes a read-only Conversation ID and Copy button below the picture. This is the conversation token used by Talk integrations, not the internal numeric room ID. Clipboard success and failure are shown; the value remains selectable for manual copying. The desktop webpack configuration wraps the original BasicInfo component without modifying the pinned Talk checkout. This is a desktop change; it does not update the server web UI or mobile apps.

Validation: ESLint, Vue type checking and Windows x64 packaging passed. The actual packaged archive contains the identifier component and retains the verified custom message and original call audio. Authenticated UI/clipboard behavior remains unverified. macOS packaging was subsequently verified on 2026-10-07; see the macOS qualification boundary below.

## Deployment configuration

Company names, server domains and branding belong in the ignored `.overrides/build.config.json`, not in source control. Set a distinct applicationName, a description identifying a custom client, the deployment domain and enforceDomain as appropriate. Use a separate application identity to avoid overwriting an official installation, and retain that identity across fork upgrades.

## Fork updates

Windows Squirrel builds use the optional HTTPS `updateFeedUrl` from the ignored
build profile. There is no upstream release fallback. Without a configured feed,
updates are disabled. Other platforms require separate native updater qualification.

The new flow checks `release-manifest.json` without invoking native download.
Users see approved short benefits and choose Update now or Skip for now before
an optional update downloads. The native download uses the immutable
`releases/<version>/` feed. Restart to update remains a separate decision;
optional updates do not interrupt calls. Detailed notes for the installed version
appear on first launch, with optional screenshots and explicit acknowledgement.
Mandatory releases use their approved grace period and persist the deadline across
restarts and temporary offline failures. The app closes at that deadline, including
an active call. Windows may still request elevation during installation.

Follow [the release publication workflow](docs/release-publication.md) for drafting,
owner approval, digest-bound staging, immutable publication and qualification.
The authoring tool never grants approval or uploads files. Keep deployment content
private. Existing 2.3.5 and earlier clients must first receive this implementation
through a qualified bootstrap update or manual installer; their old UI cannot be
changed by new feed metadata. macOS inherits shared source but still needs its own
build, signing, feed and installation qualification.

## Sound

The user-supplied MP3 was converted to OGG Vorbis quality 5 without a volume adjustment. The existing client plays it at 50% volume. Its SHA256 is:

001cd78615b585e6b3ff883dd88f533a5ed8762cf5928efa7b3ce8af25eba1ff

The replacement is not the upstream CC0 recording. See sounds/notification.ogg.license for its provenance. Call audio remains the original upstream asset.

## Build on Windows

Use Node 24 and npm 11. Run npm ci in this repository; the lock installs Talk
v25.0.3 under node_modules/talk. On npm 11.11.0 the repository's allow-git=root
policy rejects the locked Talk dependency (EALLOWGIT); the isolated validation
install used npm ci --ignore-scripts --allow-git=all without changing the tracked
policy, followed by node node_modules/electron/install.js. Review that explicit
Git-fetch exception for the build environment before using it.

TALK_PATH or an existing spreed/ checkout overrides the installed frontend.
Verify the resolved path and package version before building; a leftover
v25.0.0 checkout is incompatible with the new call-button patch. The cleanup and
call-button tests use build/resolveBuildConfig.js to inspect the same frontend
as webpack. No separate source clone is required for the default build.

Set CHANNEL=stable for building and packaging. Run npm run build:windows:x64, then npm run package:windows:x64:exe. Validate the resulting archive with:

node scripts/verify-custom-package.cjs "<package>/resources/app.asar"
node scripts/verify-call-window-package.cjs "<package>/resources/app.asar"

An optional third argument supplies the expected version when verifying an earlier build. The verifier checks the custom sound hash and retained call audio in the actual package. Signing credentials stay outside source control. No production server change is required.

## Acceptance and validation

The sound replacement passed type checking, Windows x64 packaging, archive audio verification and packaged CLI startup. An internal unsigned installer was built. The optional Windows registry policy reader was not installed by npm in this environment; Group Policy overrides were not verified. These checks do not establish audible notification delivery.

Quit the official client and close or mute any browser client before testing. Sign into the customized client, leave another conversation open and receive a message. Expect one Windows banner and the custom sound once. Repeat with the window closed to the tray and with notification sounds disabled or DND enabled. Calls should retain their original ring. Fully quitting stops background operation.

## macOS internal distribution

Upstream supports arm64, x64 and universal builds. Build and test on macOS. The same audio customization applies. Distribute the DMG privately; App Store submission is not required. For normal Gatekeeper acceptance use Developer ID signing and notarization. Forge supports APPLE_ID, APPLE_ID_PASSWORD and APPLE_TEAM_ID, with the signing identity installed in the build Mac's keychain. Keep credentials outside source control.

On 2026-10-07, the Apple Silicon build was installed and started on a Mac, and a universal DMG was compiled and statically verified. Type checking, 27 call/window tests and both package verifiers passed. Intel runtime and authenticated login, messaging, audible notifications, calls and screen sharing remain unverified. The internal artifact has no Developer ID signing/notarization; macOS automatic updates remain disabled.

Use the [macOS internal distribution runbook](docs/macos-distribution.md) for architecture-specific build/package commands, checksum and provenance staging, manual download publication and live acceptance. Preserve the approved application name and identity in the ignored local profile. Packaging does not itself qualify login or calls.

https://developer.apple.com/macos/distribution/
https://developer.apple.com/developer-id/
https://github.com/nextcloud/talk-desktop
