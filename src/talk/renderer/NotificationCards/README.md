<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Notification cards

Registers `workspace_notification_card` before the bundled Talk frontend mounts.
The server integration app (1.1.0+) normalizes Slack notification blocks and custom
audit fields. Shared references contain only a card identifier; authenticated reads
go to the current account's server through the existing account interceptor.

The dependency-free renderer and stylesheet are pinned in `vendor/provenance.json`.
Update them from the source commit using binary `git show` output, record SHA-256,
and run the source repository's Electron DOM tests. Do not fetch server JavaScript
at runtime or reformat the vendored files. Account/conversation changes discard
in-flight responses; mounted cards revalidate membership every 30 seconds.

Run `node --test src/talk/renderer/NotificationCards/cardWidget.test.mjs` for
transport, retry, lifecycle, revocation and vendored-hash tests. Run targeted
ESLint, `npm run ts:check`, and the renderer build before merging. Qualify packaged
Windows/macOS clients separately before publishing a desktop release.

This adds no interactive bot actions and changes no updater policy. Talk retains
the readable fallback text above the card. Existing desktop installations require
a new qualified build to render cards; a server deployment alone is insufficient.
