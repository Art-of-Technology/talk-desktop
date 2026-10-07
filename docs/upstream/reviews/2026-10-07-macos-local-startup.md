# macOS local startup and partial upstream review — 2026-10-07

<!-- SPDX-FileCopyrightText: 2026 Fork contributors -->
<!-- SPDX-License-Identifier: MIT -->

Status: PARTIAL upstream review; successful native local startup. No upstream adoption or release qualification.

## Local evidence

Fork Art-of-Technology/talk-desktop, verified default branch main, SHA 63b9e82a82e45dfbb2cd1854ac35fd328fe8a972. Application 2.3.6, bundled Talk 25.0.3. Apple Silicon host.

- Installed with Node 24.21.0 / npm 11.19.0 using `npm ci --ignore-scripts --allow-git=all`, as documented in CUSTOMIZATION.md; then ran Electron's install script. Tracked dependency pins unchanged.
- `CHANNEL=stable npm run build:mac:arm64`: passed.
- `npm run ts:check`: passed.
- Call window manager, window identity, call actions, idempotent leave and call button suites: 27 passed, zero failures.
- Both package verifiers passed: custom notification sound, original call sound, version and injected call callbacks present.
- Launched `out/Nextcloud Talk-darwin-arm64/Nextcloud Talk.app`; native login screen visibly rendered and application remains running. No server/account configured.
- Packaged Info.plist includes NSCameraUsageDescription and NSMicrophoneUsageDescription inherited from Electron. Do not report these as missing.

## Product limitations and remaining acceptance

- Mac automatic updates are disabled by the Windows/Squirrel-only support check in src/bootstrap.js:228. Manual replacement is required until a Mac updater is implemented and qualified.
- Package has an ad-hoc executable signature, no Developer ID team or sealed resource signature; not a signed/notarized distribution artifact.
- resources/macos/entitlements.plist is supplied as extendInfo in forge.config.js:222, not explicit code-signing entitlements. Validate actual signed entitlements when preparing distribution.
- Default identity is com.nextcloud.talk.mac / Nextcloud Talk. Choose a distinct approved fork profile before wider deployment to avoid overlap with the official client.
- First startup logged a nonfatal Vue Devtools ENOENT: src/bootstrap.js:136 installs it unconditionally, while src/install-vue-devtools.js:44 creates a nested directory without recursive parents. Login still rendered. Runtime also logged a sandbox-extension warning and the existing ready-to-show fallback.
- Authenticated messaging, audible notifications, microphone/camera, screen sharing, reconnects and two-participant calls remain untested. Screen permission denial opens System Settings and returns no source (src/bootstrap.js:87-95).
- npm install reported 44 audit findings, including 2 critical; these are untriaged dependency findings, not established reachable product vulnerabilities. No automatic audit fix was applied.

Logs: /tmp/talk-desktop-install.log, /tmp/talk-desktop-build.log, /tmp/talk-desktop-types.log, /tmp/talk-desktop-tests.log, /tmp/talk-desktop-runtime.log. These temporary files are local and may disappear.

## Upstream scope and gaps

Verified official desktop main at 02175daf0160ab2a82aa956e9d3e5323a784c164, fetched into refs/remotes/upstream-review/main without tags. Enumerated nine commits after the previously integrated f45e9bcba5ce1c5c669fec52b565393f0b49c0a2. Existing review ledger had no complete cursor; this narrow scan does not replace the unreviewed earlier interval from 0119026681ce60ee42f7f63abc286c6114044cd8.

- Defer upstream beta-channel preference change 370199760793351bdd3458caafe0def718160a1c. Inspected its service/config/migration changes; fork update consent and configured-feed behavior require a separate adaptation review and updater tests. No adoption authorized.
- Electron bump 83773067f8799ee6895cc95d9e092f9798ce814c (44.4.3 to 44.4.5): dependency diff inspected, release/security assessment still needed before a recommendation.
- Other dependency/translation/merge commits enumerated only, not fully assessed.
- Frontend release pin is 3c8cd64865fb05a257fc43404dc281ba333427fa; source history and official advisories were not assessed. No claim of complete security coverage.

Next review: before distribution/release or a separate maintenance session. No complete-review cursor advanced; no source/dependency adoption occurred.

## Follow-up macOS remediation

- The owner confirmed successful login and visible conversations after reopening authentication with the canonical server origin. Console evidence on the alias showed CSP `form-action 'self'` blocking the post-login cross-origin redirect. No CSP relaxation was applied.
- Added a native hdiutil Forge maker for Node 24 packaging, replacing the failing appdmg execution path. The DMG uses a plain Finder layout with an Applications shortcut; application identity is unchanged.
- Corrected the release helper's architecture-specific npm script names.
- Packaged applications skip Vue Devtools installation; development installation creates missing parent directories.
- The native Electron synthetic-media smoke test passed on Apple Silicon: call renderer and video track survive independent chat navigation, cancelled close preserves the call, and release closes only the call window. This is not real microphone/camera/network acceptance.
- This Mac has an Apple Development identity but no Developer ID Application identity; Developer ID signing and notarization remain unqualified.
- New build verification does not replace or change the already published immutable internal-test artifact. See the macOS distribution runbook for repeatable staging and publication.

Final local regression gate: 137 Node tests, changed-file ESLint, Vue type
checking, universal rebuild, standard Node 24 Forge DMG command, and packaged
audio/call-callback verifiers passed. The owner reported microphone permission
prompt persistence and a call-leave timeout afterward; that separate native
media investigation remains open.
