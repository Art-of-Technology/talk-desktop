<!--
  - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: MIT
-->

## Fork installer workflow

This fork is a reusable desktop client. Keep all committed code, guidance, filenames, branch names and commit messages brand-neutral. Company names, customer domains, logos, signing credentials and deployment-specific identities belong in ignored local build inputs, never in tracked files or release metadata without explicit publication authorization.

### Required user inputs

Before building an installer, establish the target platform explicitly: Windows, macOS, or both. If the request does not state it, ask: "Which platform should I build for: Windows, macOS, or both?" Do not infer the target from the agent's current operating system or a previous installer's platform. If the current request already says Windows or macOS, that satisfies this requirement; do not ask the same question again.

Also establish the display name and server URL from the request or the user's previously approved profile. Ask for any missing values. Check the target architecture: Windows x64/ARM64 or macOS Apple silicon/Intel/universal. Ask if it is unknown and affects the build; do not silently produce a package incompatible with the user's machines.

### Local brand profiles

Use the existing `.overrides/build.config.json` mechanism. Profiles for different deployments must remain ignored and be selected explicitly for each build. Do not accidentally reuse the previous deployment's profile. Preserve approved local profiles when switching between builds.

Configure the application name, description, server domain, domain enforcement and platform packaging options there. Keep application identifiers distinct between deployments and stable across upgrades of the same deployment. Verify the resolved identifiers and executable name before packaging. Reuse the shared notification audio unless the user requests another sound; do not change call audio as part of a message-sound request.

Do not hard-code a deployment's identity into shared source. Do not force-add ignored profiles, private branding assets, credentials, installer binaries or build logs to Git. Before committing, inspect staged paths and text for deployment-specific identifiers. Push changes only to this fork, not upstream.

### Build, verify and deliver

Read `CUSTOMIZATION.md` for pinned dependencies, build commands and current limitations. Build Windows installers on Windows and macOS packages on a Mac. A request for macOS does not authorize claiming a Mac build was tested on Windows. Internal Mac distribution can use a signed, notarized DMG without App Store submission; establish available build hardware and signing credentials before promising a signed artifact.

Set CHANNEL=stable for packaging. Verify the actual packaged audio with `scripts/verify-custom-package.cjs`, check the retained call sound, package identity, version and intended server configuration, and perform a packaged startup check. Report signing status accurately. Distinguish packaging and static validation from an authenticated, audible notification test.

Deliver the requested local installer and checksum with its platform/architecture, version, and concise installation instructions. Explain that users should quit other clients during notification testing to avoid duplicate alerts. Do not install it, publish a release or upload a customer-branded artifact unless the user requests that action. Keep company-specific delivery notes local. No server deployment is required for a bundled desktop sound replacement.

## Release content approval gate

For every requested release, follow `docs/release-publication.md`. Prepare two distinct drafts: short pre-install benefits and detailed first-launch changes. Include optional screenshot proposals and the explicit optional/mandatory policy and grace period. Present those drafts for owner approval before publishing a feed, installer or update announcement. Never manufacture approval from a request to implement a fix. Previously granted approval applies only to its matching reviewed metadata/artifact digest; changes require renewed approval.

Use `scripts/release-authoring.cjs review` to bind the exact manifest, feed destination and full package. Record the owner's actual explicit approval in a private approval artifact and use `stage` to prepare publication files. Keep branded notes, screenshots, approval records and feed destinations in ignored/private storage. Do not upload the approval record. Preserve version-pinned release directories and historical notes. A generic code merge/deploy approval does not authorize an unreviewed mandatory update that closes users' apps.

Existing clients keep their old update experience until the bootstrap upgrade. Explain this limitation and Windows elevation prompts accurately. A macOS release requires its own native build and qualification even though source is shared. Do not publish or enforce a mandatory update on an unqualified platform.

## Nextcloud Contribution Policy

All contributions generated or assisted by this agent must fully comply with:

- **[AI Contribution Policy](https://github.com/nextcloud/.github/blob/master/AI_POLICY.md)** - the primary reference for AI-specific rules, covering disclosure, author accountability, communication, security, licensing, code quality, and autonomous agent behavior.
- **[Contribution Guidelines](https://github.com/nextcloud/.github/blob/master/CONTRIBUTING.md)** - covering testing requirements, the Developer Certificate of Origin (DCO), license headers, conventional commits, and translations. These apply in full to all contributions regardless of how they were produced.

### What this agent must always do

- Add an `Assisted-by: AGENT_NAME:MODEL_VERSION` git trailer to every commit containing AI-assisted content.
- Ensure every pull request includes a disclosure of AI tool use in the PR description.
- Produce focused, scoped pull requests that address exactly one concern. Do not touch unrelated files or introduce incidental refactors.
- Verify all dependencies against actual package registries before suggesting them. Do not use hallucinated or unverified package names.
- Explicitly inform the contributor when any action they are about to take, or have taken, would violate the AI Contribution Policy or the Contribution Guidelines. Do not silently proceed. State which rule is at risk and what the contributor should do instead.
- Warn the contributor if a pull request is growing too large. A PR approaching several thousand lines of changed code is a signal that it should be split into smaller, focused PRs. Suggest a logical split before the PR is opened, not after.
- Recommend opening a ticket for discussion before starting implementation whenever a feature or change is sufficiently complex - for example when it touches multiple subsystems, requires architectural decisions, or the right approach is not yet clear. A ticket allows maintainers and the contributor to align on direction before code is written, avoiding wasted effort on a PR that may be rejected or require fundamental rework.

### What this agent must never do

- Open issues, submit pull requests, post review comments, or send security reports autonomously. Every contribution must be reviewed and submitted by a human.
- Add `Signed-off-by` tags to commits. Only the human contributor can certify the Developer Certificate of Origin.
- Generate or submit security reports without independent human verification. Report verified vulnerabilities via [HackerOne](https://hackerone.com/nextcloud), not as GitHub issues.
- Write PR descriptions, review comments, or issue reports on behalf of the contributor. These must be in the contributor's own words.
- Fully automate the resolution of issues labeled [`good first issue`](https://github.com/issues?q=org%3Anextcloud+label%3A%22good+first+issue%22) or similar beginner-friendly labels.
- Submit code that has not been reviewed and cleaned up by the contributor. Dead code, redundant logic, excessive comments, and unrelated changes must be removed before submission.
