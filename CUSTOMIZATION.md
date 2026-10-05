# Desktop notification sound customization

Based on Nextcloud Talk Desktop v2.3.2 (0119026681ce60ee42f7f63abc286c6114044cd8), with the upstream-pinned Talk v25.0.0 frontend (57912db53daa69306cdc3bd99cce0615f0dbeb5a).

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
web client or native mobile apps. The build-time media cleanup patch fails if
the expected upstream implementation changes, requiring a review on upgrades.

Local verification commands:

```
node --test scripts/test-call-window-manager.cjs
node --test src/talk/renderer/CallWindow/callWindowActions.test.mjs src/talk/renderer/CallWindow/idempotentLeave.test.cjs
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

Validation: ESLint, Vue type checking and Windows x64 packaging passed. The actual packaged archive contains the identifier component and retains the verified custom message and original call audio. Authenticated UI/clipboard behavior and macOS packaging have not yet been verified for this change.

## Deployment configuration

Company names, server domains and branding belong in the ignored `.overrides/build.config.json`, not in source control. Set a distinct applicationName, a description identifying a custom client, the deployment domain and enforceDomain as appropriate. Use a separate application identity to avoid overwriting an official installation, and retain that identity across fork upgrades.

## Fork updates

Windows Squirrel builds use the optional HTTPS `updateFeedUrl` from the ignored
build profile. There is no upstream release fallback. Without a configured feed,
updates are disabled. Other platforms show manual updates until separately qualified.
Install the first updater-enabled build manually. Subsequent checks use the same
menu, download the package and offer Restart to update. Restart is blocked during
an active call. Squirrel also applies a downloaded update on the next normal app
start; the client never forces an automatic restart.

The main chat window shows a dismissible Update available dialog while downloading,
then Restart to update when ready. Progress is indeterminate because the native
Squirrel API does not expose reliable byte progress. Later keeps the download and
menu entry available. Notices wait until calls end and are suppressed after being
shown for the same installed/target version. A silent Windows notification opens
the dialog when the app is in the background; it never installs by itself.

Checks run shortly after startup and every six hours. The feed contains RELEASES
and the full nupkg under the exact filename listed in that manifest. Forge renames
output artifacts, so restore and verify their feed names with:

```
node scripts/stage-desktop-update.cjs <manifest-artifact> <nupkg-artifact> <fresh-output-directory>
node --test scripts/test-desktop-updater.cjs scripts/test-stage-desktop-update.cjs
```

Publish packages before replacing RELEASES atomically. Do not cache RELEASES;
versioned packages may be immutable. Keep deployment URLs and branded packages
outside source control. Package verification and mocked updater tests do not
prove an installed upgrade; test the hosted feed and upgrade on a separate test
installation before broad distribution. macOS needs its own signed build and feed.

## Sound

The user-supplied MP3 was converted to OGG Vorbis quality 5 without a volume adjustment. The existing client plays it at 50% volume. Its SHA256 is:

001cd78615b585e6b3ff883dd88f533a5ed8762cf5928efa7b3ce8af25eba1ff

The replacement is not the upstream CC0 recording. See sounds/notification.ogg.license for its provenance. Call audio remains the original upstream asset.

## Build on Windows

Use Node 24 and npm 11. Clone nextcloud/spreed at v25.0.0 into spreed/, then run npm ci in both repositories. If lifecycle scripts are disabled, explicitly run node node_modules/electron/install.js.

Set CHANNEL=stable for building and packaging. Run npm run build:windows:x64, then npm run package:windows:x64:exe. Validate the resulting archive with:

node scripts/verify-custom-package.cjs "<package>/resources/app.asar"

An optional third argument supplies the expected version when verifying an earlier build. The verifier checks the custom sound hash and retained call audio in the actual package. Signing credentials stay outside source control. No production server change is required.

## Acceptance and validation

The sound replacement passed type checking, Windows x64 packaging, archive audio verification and packaged CLI startup. An internal unsigned installer was built. The optional Windows registry policy reader was not installed by npm in this environment; Group Policy overrides were not verified. These checks do not establish audible notification delivery.

Quit the official client and close or mute any browser client before testing. Sign into the customized client, leave another conversation open and receive a message. Expect one Windows banner and the custom sound once. Repeat with the window closed to the tray and with notification sounds disabled or DND enabled. Calls should retain their original ring. Fully quitting stops background operation.

## macOS internal distribution

Upstream supports arm64, x64 and universal builds. Build and test on macOS. The same audio customization applies. Distribute the DMG privately; App Store submission is not required. For normal Gatekeeper acceptance use Developer ID signing and notarization. Forge supports APPLE_ID, APPLE_ID_PASSWORD and APPLE_TEAM_ID, with the signing identity installed in the build Mac's keychain. Keep credentials outside source control.

No Mac artifact has been built or tested here.

https://developer.apple.com/macos/distribution/
https://developer.apple.com/developer-id/
https://github.com/nextcloud/talk-desktop
