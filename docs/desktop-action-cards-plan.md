# Desktop action cards: implementation and qualification

Status: owner selected B, full desktop integration, on 2026-10-05 after the
app-password risk was explained. Implement separate desktop routes; preserve web
rules. No production approve/retry testing or client qualification enabled.

## Verified integration points

- Current fork version is 2.3.3; preserve the existing local updater, sound,
  conversation identifier and call-window changes.
- `src/app/webRequestInterceptor.js` adds Basic Authorization and OCS-APIRequest
  to account-server requests. The current relay controller explicitly rejects
  these. Removing headers would not change a token session into a browser session.
- Register the renderer's `edison_actions_prompt` widget before chat mounting,
  after account setup. Bundle source locally; never execute server-hosted scripts.
- Read the active conversation token from Talk's router, not the desktop URL.
  Snapshot the account and conversation for each mounted card; invalidate pending
  work on account/conversation change so an old card cannot act in a new context.
- Baseline relay/widget source reviewed at commit
  `dd64270f6089acb6886f2a42d46c0c77797d9811`. Confirm the release tag and live server
  revision before qualification. Do not assume this checkout is deployed.
- The reviewed widget has no client-side timeout. Port with an explicit five-second
  abort timeout; do not blindly copy this omission. Preserve web behavior.

## Authentication decision (required before implementation)

A: authenticated desktop state and decline only; privileged actions remain web-only.
B: authenticated desktop actions with explicit owner acceptance, confirmation,
   rate limiting and audit; membership, approver checks and single-use CAS retained.
C: separate cookie-authenticated web session; server rules unchanged. An isolated
   web session must not inherit the desktop Authorization/OCS interceptor.

Client headers cannot establish that a request came from a trusted desktop binary.
Do not use an application name, user-agent or custom client header as authorization.
Any relay changes must be reviewed in its own repository and pass its required gates.

## Delivery steps after the decision

1. Implement a transport-independent card renderer and state machine with tests:
   static reference contains only validated promptId, all strings use textContent,
   only server-returned recognized actions render, allowed:false stays disabled.
2. Implement the chosen authenticated transport and server-side policy together.
   Absolute account-scoped URLs, no identity payload and no direct Edison calls.
   Do not follow cross-origin redirects or expose credentials to renderer code.
3. Each click receives 16 cryptographically random bytes encoded as 22-character
   base64url. Send exactly one action POST, never retry an uncertain action.
   Disable buttons while pending; invalidate stale polls, reread after completion,
   retain private click feedback, stop and abort work when unmounted.
4. Hide a 404 card; generic Turkish error on other failures. Do not leave stale
   actionable controls enabled following an authorization/state-read failure.
   Recheck state after timeout rather than resending. Poll mounted cards without
   overlapping requests; private responses remain uncached.
5. Test malformed references, tampered/disabled actions, duplicate clicks, stale
   responses, timeout/no retry, 404, account switch, unmount, safe text rendering,
   URL containment and callback cleanup. Run existing fork tests, lint and types.
6. Qualify in a designated test conversation with decline only. Verify membership,
   session-derived identity, forged/cross-site rejection, two-user convergence,
   private feedback, no mutation on reads and static cached references.
7. Build and qualify each shipped OS separately. Windows qualification does not
   qualify macOS. Do not change TALK_QUALIFIED_CLIENTS; Edison owner updates that
   only after acceptance evidence. No production approve/retry testing.

## Release update experience (owner request, 2026-10-05)

Include an in-app update notification and dismissible popup in this release.
Use only the configured fork feed. Show download status without fabricated progress;
once downloaded offer Restart to update and Later. Restart installs the native
package and relaunches the app, with active calls blocking restart. Avoid repeated
prompts for the same ready version, retain a menu entry, and surface failures with
a retry path. Verify native and renderer behavior without installing over the
user's running client. Publishing a newer feed version is distinct from building it.
