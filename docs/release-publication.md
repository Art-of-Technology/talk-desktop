# Reviewed desktop releases

Release content has two separate audiences: short benefits before downloading, and detailed changes on the first launch of the installed version. Both are owner-approved publication content, including screenshot proposals and mandatory-update policy. Code approval is not approval of release notes.

## Author and approve

1. Build and qualify the exact platform/architecture installer and full update package. Keep stable application identity. Do not claim macOS qualification from Windows tests.
2. Create a manifest outside the tracked tree (an ignored private directory is also acceptable). Preserve historical entries so clients that installed an older version can see their own notes, even when a later version is available.
3. Present the short summary, detailed sections, proposed screenshots, optional/mandatory status and grace period to the owner. Mandatory means the app will close when the approved deadline expires, including an active call. Default grace is 15 minutes; explicitly show that value in the proposal. A zero-minute policy must be described as update-or-quit immediately.
4. Generate the review record against the final manifest, feed URL, RELEASES and full package. Show the digest with the reviewable notes. Any change to notes, policy, destination or package requires a new record and matching approval. Do not invent approval, infer it from a generic request to fix something, or reuse an unrelated release approval.
5. After explicit owner approval, record the approval artifact below with the actual approver and time. The CLI intentionally has no auto-approve command. This artifact records a human decision; it is not a cryptographic identity signature or a replacement for access controls on release storage.
6. Stage the bundle, qualify it, then publish only within the user's authorized release scope. The tool performs no network uploads.

Example private draft (replace placeholder URLs only in private release inputs):

```json
{
  "schemaVersion": 1,
  "latestVersion": "2.3.6",
  "releases": [{
    "version": "2.3.6",
    "title": "Choose when to update",
    "summary": ["Read the changes before downloading.", "See detailed release notes after installation."],
    "sections": [{
      "heading": "Updates on your terms",
      "body": "The update notice shows the benefits before you choose Update now. Optional updates can be skipped for now.",
      "images": [{
        "url": "https://updates.example/desktop/assets/2.3.6/update-dialog.png",
        "alt": "Update notice with Update now and Skip for now controls",
        "caption": "A preview of the update notice."
      }]
    }],
    "mandatory": false,
    "graceMinutes": 15
  }]
}
```

Images are optional; use `images: []` when none are approved. For every screenshot URL, supply its exact local file beneath the draft directory at `assets/<release-version>/<filename>`, matching the path relative to the feed URL. Historical screenshots must also remain available beside the draft. Only PNG, JPEG and WebP files (up to 10 MiB each) are accepted; HTML and SVG are rejected. The review digest binds each screenshot SHA256 and size, and staging copies those exact bytes into the versioned assets path. Missing files or changed image bytes fail approval validation. Strip personal information and secrets, present the actual images for owner approval, and never overwrite published images. Only text and image URLs are supported, never HTML or scripts.

```text
node scripts/release-authoring.cjs review <draft.json> <https-feed-url> <RELEASES-artifact> <full.nupkg-artifact> <new-review.json>
```

Approval artifact, created only after the owner accepts the exact review:

```json
{
  "schemaVersion": 1,
  "decision": "approved",
  "approvedBy": "Actual owner identity",
  "approvedAt": "2026-10-06T12:00:00Z",
  "digest": "COPY_THE_64_CHARACTER_DIGEST_FROM_THE_APPROVED_REVIEW"
}
```

```text
node scripts/release-authoring.cjs stage <draft.json> <https-feed-url> <RELEASES-artifact> <full.nupkg-artifact> <approval.json> <fresh-private-bundle>
node --test scripts/test-release-authoring.cjs scripts/test-stage-desktop-update.cjs scripts/test-desktop-updater.cjs
```

The bundle contains `release-manifest.json`, `releases/<version>/RELEASES`, the full package under that pinned directory, and `approval-record.json`. The approval record is private release evidence: **do not upload it to the public feed**. Staging verifies the RELEASES size/SHA1, binds the full package's SHA256 and checks the embedded NuGet metadata version against latestVersion. It reads bounded ZIP metadata without extracting executables. Packaged executable identity/version verification and installation testing remain required; NuGet metadata alone is not proof of the executable's contents. A failed stage is unpublished and must be discarded or investigated; never publish a partial directory.

## Publish and qualify

Upload the version-pinned package, pinned RELEASES and approved screenshot assets first. Never overwrite an existing version directory with different bytes. Verify public checksums, content types and URLs before atomically replacing the root `release-manifest.json`. Serve that root manifest without stale caching; immutable version assets may be cached. Retain all previously published version directories. The client downloads only the accepted version's pinned feed, so changing latest must not change an in-progress installation.

Test the hosted manifest and an installed upgrade on an isolated Windows installation. Confirm no native download/UAC prompt before Update now, skip leaves the app usable, restart respects optional call blocking, exact installed notes appear once and can be reopened, and malformed/offline metadata fails safely. Test mandatory expiration only with dummy sessions in an isolated feed: the policy persists across restarts/offline, a later optional release does not reset it, and a valid updated manifest can withdraw it. A mandatory policy cannot compel machines that have never fetched it while offline. OS elevation or signing prompts can still appear after a user chooses to install; an in-app notice cannot remove Windows security prompts.

## Bootstrap and macOS

Clients already running 2.3.5 or earlier use their old update UI. Publishing this manifest cannot retrofit a new dialog into those binaries. The first release containing this implementation must reach those users through a manual installer or the separately approved legacy root `RELEASES` feed. If maintaining the legacy feed, use `stage-desktop-update.cjs` only for that explicitly approved bootstrap artifact; it does not enforce content approval. Legacy and pinned packages must be the same qualified bytes. Do not claim old clients display the new consent or mandatory policy. Future releases use the new manifest flow after that upgrade.

Windows and macOS share renderer and release-note source, but packaging and installation require separate qualification. Windows Squirrel packages are not macOS updates. The [manual macOS download workflow](macos-updates.md) uses explicit architecture feeds, user-approved verified DMG downloads, and manual installation instructions. It never invokes native Squirrel.Mac installation and rejects mandatory Mac policies. Mac publication uses `scripts/mac-release-authoring.cjs`; the Windows commands above do not stage Mac packages. A native Mac build and manual-upgrade qualification remain necessary before publishing a Mac feed.
