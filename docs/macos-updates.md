<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->

# Unsigned macOS update downloads

This fork supports release notes and manual DMG downloads on macOS. Build the
application from this fork to include the feature. It does not use Electron's
native `autoUpdater` to install unsigned Mac updates. The user downloads the DMG,
quits the application, and installs the replacement manually. Updates remain
optional: Mac metadata with `mandatory: true` is rejected.

An already installed Mac client without this code needs a manual bootstrap
installation before it can show these notices. The existing `updateFeedUrl`
setting remains Windows-only.

Checks run ten seconds after a normal full app launch and every six hours while
the process remains open, matching the existing Windows schedule. The menu can
request a check immediately. An optional announcement waits until a call ends;
an already dismissed announcement is not repeatedly reopened. Downloads start
only after consent. Completion opens manual installation instructions and a
Show in Finder button; neither downloads nor reveal quit the app.

The SHA-256 check verifies bytes against metadata delivered over the configured
HTTPS feed. It is not an Apple signature or independent proof of publisher
identity. Never describe these packages as signed or notarized.

## Private configuration

Set `macUpdateFeedUrls` in the selected ignored `.overrides/build.config.json`:

```json
{
  "macUpdateFeedUrls": {
    "arm64": "https://updates.example/mac/arm64/",
    "x64": "https://updates.example/mac/x64/"
  }
}
```

The application chooses the feed using `process.arch` (`arm64` or `x64`). A
universal DMG feed may be assigned to both keys. Preserve identifiers across
upgrades and keep deployment identities, domains, branded notes, build outputs,
and approval artifacts in ignored/private storage. The example domain above is
only a placeholder.

## Native build and qualification

Build on a Mac from this fork using the approved private profile and
`CHANNEL=stable`; follow [CUSTOMIZATION.md](../CUSTOMIZATION.md). Qualify each
supported architecture on native hardware, including launch, configured server,
package identity/version, notification audio, notes, download and manual upgrade.
A universal artifact needs qualification on both architectures.

The authoring script validates the hash, size, metadata, and the UDIF `koly`
trailer. That check does not establish installability, embedded app version,
architecture, or signing status. Inspect those properties on the Mac before
owner review. These artifacts are explicitly unsigned; this workflow makes no
Apple signing or notarization claim and provides no Gatekeeper bypass. If macOS
blocks an artifact, use the organization's approved installation process or
obtain an appropriately signed distribution.

## Draft, review, and stage

Draft `release-manifest.json` in private storage. Keep historical release notes;
each release includes `macDownload` with its own version-pinned URL. The first
version of this tooling rejects screenshots (including in historical notes)
because screenshot artifacts are not included in the approval binding.

```json
{
  "schemaVersion": 1,
  "latestVersion": "1.2.3",
  "releases": [{
    "version": "1.2.3",
    "title": "Clearer update controls",
    "summary": ["Review changes before downloading."],
    "sections": [{
      "heading": "Updates",
      "body": "Download the new release and install it when convenient.",
      "images": []
    }],
    "mandatory": false,
    "graceMinutes": 15,
    "macDownload": {
      "url": "https://updates.example/mac/arm64/releases/1.2.3/Example.dmg",
      "sha256": "REPLACE_WITH_64_LOWERCASE_HEX_DIGITS",
      "size": 123456,
      "arch": "arm64",
      "signing": "unsigned"
    }
  }]
}
```

Replace the checksum and size with the final DMG's values; `arch` is `arm64`,
`x64`, or `universal`. All DMG URLs must be HTTPS beneath the configured feed's
`releases/<version>/` path. The target URL's safe basename determines the staged
filename, allowing an explicitly reviewed rename of the local build artifact.

```text
node scripts/mac-release-authoring.cjs review <draft.json> <feed-url> <arm64|x64|universal> <build.dmg> <private-review.json>
```

Present the short benefits, detailed changes, unsigned/manual installation
policy, architecture, destination and artifact to the owner. Review binds the
exact metadata bytes (including historical notes), DMG SHA-256 and size, feed,
architecture, target filename and current notes. It does not grant approval.
Record only an actual explicit approval in a private file:

```json
{
  "schemaVersion": 1,
  "decision": "approved",
  "digest": "EXACT_DIGEST_FROM_REVIEW",
  "approvedBy": "ACTUAL_OWNER",
  "approvedAt": "ACTUAL_APPROVAL_TIME_IN_ISO_8601"
}
```

```text
node scripts/mac-release-authoring.cjs stage <draft.json> <feed-url> <arm64|x64|universal> <build.dmg> <approval.json> <fresh-private-bundle>
```

The parent directory must exist. Staging requires a fresh directory, preserves
the original manifest bytes, copies the DMG to `releases/<version>/<filename>`,
and rechecks both staged and source inputs. A failure removes the newly created
bundle. Existing directories are never overwritten. Any changed metadata or
artifact requires a new review and matching explicit owner approval.

Staging does not publish. After native qualification and publication approval,
publish the pinned artifact first and the manifest last to the reviewed HTTPS
feed. Retain older version directories and historical metadata. Keep
`approval-record.json` private; never upload it. The bundle contains only the
latest DMG, so preserve historical artifacts already present at the destination.

Run the authoring checks with:

```text
node --test scripts/test-mac-release-authoring.cjs
```

The test DMGs are synthetic trailer fixtures; passing these checks does not
replace native Mac qualification.
