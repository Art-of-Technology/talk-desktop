# Desktop notification sound customization

Based on Nextcloud Talk Desktop v2.3.2 (0119026681ce60ee42f7f63abc286c6114044cd8), with the upstream-pinned Talk v25.0.0 frontend (57912db53daa69306cdc3bd99cce0615f0dbeb5a).

Only the bundled message audio is replaced. Native notification behavior, DND/mute preferences, call audio, tray handling and authentication remain upstream behavior. The official client already uses silent OS banners plus one bundled audio playback. This fork retains that approach; it does not attach custom sound to Windows toast XML.

## Deployment configuration

Company names, server domains and branding belong in the ignored `.overrides/build.config.json`, not in source control. Set a distinct applicationName, a description identifying a custom client, the deployment domain and enforceDomain as appropriate. Local branded builds disable the upstream update scheduler. Use a separate application identity to avoid overwriting an official installation. Distribute updates manually from this fork.

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
