# Internal macOS distribution

<!-- SPDX-FileCopyrightText: 2026 Fork contributors -->
<!-- SPDX-License-Identifier: MIT -->

Build on a Mac with Node 24 and npm 11. A DMG is a downloadable installer;
users do not need this repository. A website download entry does not enable
in-app updates: macOS still requires manual application replacement.

## Select and build

Establish the approved application identity, server and architecture before
building. Keep deployment settings in ignored `.overrides/build.config.json`.
Preserve the approved application name and bundle identifier across upgrades;
changing the DMG filename does not rename the installed application. Do not
commit profiles, customer URLs, credentials, binaries or deployment logs.

Use `npm ci` with the lockfile. See [CUSTOMIZATION.md](../CUSTOMIZATION.md#build-on-windows)
for the explicit npm Git dependency exception if `EALLOWGIT` blocks installation.
Check `TALK_PATH` and any `spreed/` override before building: the default frontend
is the locked `node_modules/talk` dependency.

```sh
export CHANNEL=stable
npm run ts:check
node --test scripts/test-call-window-manager.cjs scripts/test-talk-window-identity.cjs
node --test src/talk/renderer/CallWindow/callWindowActions.test.mjs src/talk/renderer/CallWindow/idempotentLeave.test.cjs src/talk/renderer/CallWindow/callButtons.test.cjs
npm run build:mac
npm run package:mac
```

`build:mac` / `package:mac` target universal (Apple Silicon and Intel). For a
single architecture use `build:mac:arm64` / `package:mac:arm64` or
`build:mac:x64` / `package:mac:x64`. Always pair matching build and package
architectures; packaging consumes an already-built application. The DMG maker
uses macOS `hdiutil`, avoiding the older DMG tool's Node 24 compatibility issue.
Use the actual output paths reported by packaging.

## Verify the artifact

Set `APP_PATH` to the packaged `.app` and `DMG_PATH` to the resulting DMG:

```sh
node scripts/verify-custom-package.cjs "$APP_PATH/Contents/Resources/app.asar"
node scripts/verify-call-window-package.cjs "$APP_PATH/Contents/Resources/app.asar"
plutil -p "$APP_PATH/Contents/Info.plist"
lipo -archs "$APP_PATH/Contents/MacOS/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP_PATH/Contents/Info.plist")"
codesign -dv --verbose=4 "$APP_PATH" 2>&1
codesign --verify --deep --strict --all-architectures "$APP_PATH"
codesign -d --entitlements - "$APP_PATH"
spctl --assess --type execute --verbose=4 "$APP_PATH"
hdiutil verify "$DMG_PATH"
shasum -a 256 "$DMG_PATH"
```

Check the resolved name, version, identifier, intended server configuration and
architecture. Inspect embedded Electron helpers/native modules as well as the
main binary before declaring universal compatibility. The package verifiers
check the actual bundled message/call audio and injected call callbacks; they
do not prove audible playback or a live call. An ad-hoc signature is not a
Developer ID signature. Gatekeeper rejection is expected for an ad-hoc signed,
unnotarized internal build; record signing and notarization separately.

Packaging now signs the complete bundle, including nested Electron code, even
without Apple credentials. The default is ad-hoc signing for internal testing.
Hardened runtime is enabled for certificate signing, not ad-hoc signing (which
has no team identity for runtime library validation).
Universal builds are signed after the architecture merge; signing or strict
verification failure aborts packaging. Entitlements are applied to the code
signature, not merged into Info.plist; specialized Electron helper entitlements
are retained.

Set `APPLE_SIGN_IDENTITY` privately to select a certificate independently of
notarization. Providing `APPLE_ID`, `APPLE_ID_PASSWORD` and `APPLE_TEAM_ID`
enables notarization; without an explicit identity this uses Developer ID
discovery. Ad-hoc signing cannot be combined with notarization.

A valid ad-hoc signature fixes the incomplete bundle identity but does not
establish trusted publisher identity or permission continuity across rebuilt
versions. Before distributing a replacement, verify microphone/camera consent
is retained on repeated use and relaunch of the exact installed artifact, then
test an upgrade separately. Do not reset TCC to conceal permission failures.

Mount the DMG read-only, check its application and Applications shortcut, then
quit the current client before copying to Applications. Verify that the copied
application starts. Do not silently replace a running client's files or delete
an existing installation. Test Intel runtime separately even when `lipo`
confirms both architectures.

For internal installation, users open the DMG and drag the application to
Applications. If Gatekeeper blocks this known internal artifact, use System
Settings → Privacy & Security → Open Anyway, then approve this application.
Do not disable Gatekeeper globally. For wider distribution, configure a
Developer ID signing identity and notarization credentials privately, then
verify the actual signature, notarization and installed artifact. App Store
submission is not required. The existing Forge signing configuration is a
starting point, not evidence that a release has been notarized.

## Prepare staging and publication

Follow [release-publication.md](release-publication.md) for the applicable
release-content approval and digest-bound staging requirements. Keep any
customer-specific metadata and owner approval records private. Do not upload
approval records.

Alongside the DMG, prepare `SHA256SUMS.txt` and `release-metadata.json` containing:

- Exact artifact filename, version, architecture and SHA256.
- Full source commit (`git rev-parse HEAD`) and whether the build tree was dirty.
  A dirty build is not reproducible from the commit alone; rebuild the committed
  tree before claiming the artifact represents that commit.
- Node/npm versions, build commands and selected profile identity without secrets.
- Actual signing and notarization status, including ad-hoc versus Developer ID.
- Qualification results and explicit untested items, separately for arm64/x64
  and for static checks, startup and authenticated behavior.

Compute the checksum inside the staging folder so its file entry is relative:

```sh
(cd "$LOCAL_STAGE_DIR" && shasum -a 256 "$ARTIFACT_NAME" > SHA256SUMS.txt)
ssh "$RELEASE_SSH" "mkdir -p ~/desktop-release-macos/$VERSION"
scp "$LOCAL_STAGE_DIR/$ARTIFACT_NAME" "$LOCAL_STAGE_DIR/SHA256SUMS.txt" \
  "$LOCAL_STAGE_DIR/release-metadata.json" \
  "$RELEASE_SSH:desktop-release-macos/$VERSION/"
ssh "$RELEASE_SSH" "cd ~/desktop-release-macos/$VERSION && sha256sum -c SHA256SUMS.txt"
```

Set the variables privately; `RELEASE_SSH` is the approved SSH user/host,
`VERSION` is the validated package version, and `ARTIFACT_NAME` is a filename
without path separators. These commands stage files only. Use an interactive
SSH terminal if a password is required; never put passwords in commands.

Before publication, inspect the current web-server configuration, download
root, workspace download selector and `latest.json`. Back up the exact files
that will change. Promote the verified artifact to the configured
`macos/<architecture>/stable/` directory; use `universal` only for a verified
universal build, `arm64` for Apple Silicon and `x64` for Intel.

Add a restricted HTTPS static download route for that directory, with directory
listing disabled and no access to staging/private files. Check configuration
with `nginx -t` before reload. Retain existing Windows routes and manifest
entries. Update `latest.json` atomically with the `macos.version` and
`macos.url` fields expected by the deployed workspace; confirm that schema
against its actual download selector before editing. Keep the Mac URL on the
workspace's HTTPS origin. This website manifest is separate from the desktop
Windows updater feed and does not qualify a Mac auto-updater.

Download the public DMG to a new file, compare its checksum to staging, and
check the workspace's Mac download choice plus the unchanged Windows download.
Restore the backed-up configuration/manifest if those checks fail. Record the
published digest privately; do not claim a later source commit is represented
by an older DMG.

## Login diagnosis and live acceptance

Use the server's canonical HTTPS URL. A login form loaded from an alias can be
blocked by CSP `form-action 'self'` when submission redirects to a different
origin. Confirm the blocked destination in DevTools Console and the failing
request status/redirect chain in Network; use the canonical origin and reopen
the login flow. Do not relax CSP to hide a deployment URL mismatch. Do not
capture passwords, request bodies, cookies, authorization headers or login
polling tokens in logs/screenshots/shared HAR files.

A persistent “too many failed login attempts” page needs server-side evidence.
Inspect authentication logs and the client IP seen by the server. Behind a
reverse proxy, trust only the exact verified proxy address/range and the
correct forwarded-IP header. Back up configuration before an authorized
change, then verify the observed IP. Do not disable brute-force protection or
trust arbitrary forwarded headers. Successful page rendering alone does not
prove successful authentication.

After login, test messaging, a single audible notification/banner, DND/mute,
relaunch/session retention, microphone/camera, screen capture permission denial
and approval, and a two-participant call. Quit other desktop/browser clients
to avoid duplicate notifications. During the call, navigate the separate chat
window, minimize it, return to the call, share a screen and explicitly leave;
confirm capture stops. Verify reconnects, incoming calls and breakout transfers
separately. Tests requiring accounts or another participant remain unqualified
until actually observed.

## Recorded qualification boundary

On 2026-10-07, an Apple Silicon package was built, installed and started on an
Apple Silicon Mac; a universal DMG was compiled and statically checked. Type
checking, 27 call/window tests and both package verifiers passed. This is
internal packaging/startup evidence, not complete product acceptance. The owner subsequently confirmed successful login and visible conversations using
the canonical server address. Intel runtime, sending/receiving messages, audible
notifications, real calls and screen sharing remain unverified. Developer ID
signing/notarization and macOS automatic updates remain separate work.

Follow-up checks passed: 137 Node tests, Vue type checking, changed-file ESLint,
universal application rebuild and the standard Node 24 `package:mac` command.
The native Electron synthetic-media continuity smoke also passed. The owner
subsequently reported a persistent microphone permission dialog together with
a call-leave timeout; real media qualification is blocked pending investigation.
