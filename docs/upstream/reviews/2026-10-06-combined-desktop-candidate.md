# Combined desktop candidate review — 2026-10-06

<!-- SPDX-FileCopyrightText: 2026 Fork contributors -->
<!-- SPDX-License-Identifier: MIT -->

Status: PARTIAL. This is compatibility evidence for a proposed integration, not release qualification or authorization to adopt additional upstream changes.

## Immutable scope

- Fork: Art-of-Technology/talk-desktop; intended integration branch: main, as assigned for this review. The remote default branch was not independently queried in this subreview.
- Customized source: ef71e9c6b384bd491ea7f3e3435f6596cedd3c00 (origin/custom/notification-sound).
- Main/upstream-derived source: f45e9bcba5ce1c5c669fec52b565393f0b49c0a2 (origin/main).
- Fork point and enumeration boundary: 0119026681ce60ee42f7f63abc286c6114044cd8.
- Initial combined index tree: 5a52f9cecad313da728227dc68f460947f46812a, created by a clean, uncommitted merge of the custom branch into main. Tests below apply to this tree unless explicitly qualified.
- This checkout is shallow, but its sole shallow boundary is the fork point above. All 76 commits after that boundary are available and enumerated using `git log --reverse --topo-order <baseline>..origin/main`. The source interval contains 47 non-merge commits and 29 merges.
- Frontend is a separate stream. The custom documentation pins source v25.0.0 at 57912db53daa69306cdc3bd99cce0615f0dbeb5a. The combined package/lock instead installs release repository nextcloud-releases/spreed v25.0.3 at 3c8cd64865fb05a257fc43404dc281ba333427fa. These repositories' commit IDs are not interchangeable. The full frontend commit interval has not been reviewed.
- Existing shared dependencies were not reused or modified: their lock versions differ materially. The combined lock adds 78 package entries, removes 6 and changes 31 versions relative to the custom source lock.

## Initial candidate findings (see authorized adaptation below)

1. **Adapt custom dialog imports before integration.** Upstream [93ad84ffae9667ea53d1181959d9ee03024bff2e](https://github.com/nextcloud/talk-desktop/commit/93ad84ffae9667ea53d1181959d9ee03024bff2e) moves Talk into npm dependencies and rewrites its own router import to a bare package. Three custom modules still import `@talk/node_modules/@nextcloud/dialogs/dist/index.mjs`: CallButton.js, participantsStore.js and callWindowLifecycle.js. The combined lock hoists dialogs 7.5.0 to root and contains no nested Talk dialogs entry. Replace these with the supported package export, retaining all call-window behavior. Verify with a clean default-layout Windows build, not the old cloned frontend.
2. **Adapt validation and documentation to resolved frontend.** `idempotentLeave.test.cjs` reads the hardcoded `spreed/src/utils/webrtc/index.js`. A clean npm layout has no such checkout. Use the same `resolveTalkPath()` as webpack so the test exercises the actual bundled source. CUSTOMIZATION.md and the review skill context still describe v25.0.0 and the removed update script. An existing local spreed directory silently overrides installed v25.0.3; any future build must record the resolved path/version rather than trust package.json.
3. **Clean install currently needs a documented npm compatibility decision.** Node 24.14.1/npm 11.11.0 with repository `.npmrc` (`allow-git=root`) rejected the locked Talk dependency with EALLOWGIT. An isolated retry uses `--allow-git=all --ignore-scripts` with the unchanged lock. This flag is validation-only; no tracked npm policy was broadened. Registry engine warning: @nextcloud/initial-state 2.2.0 declares Node 20/npm 10 despite the desktop's Node 24/npm 11 requirement.
4. **CallButton v25.0.3 breaks the custom options-method wrapper.** Exact source at release SHA 3c8cd64865fb05a257fc43404dc281ba333427fa was inspected: CallButton.vue is now script-setup, with lexical handleJoinCall and no options methods/leaveCall. Our CallButton.js options overrides no longer intercept template callbacks. The upstream join sets loading true and resets only after awaited join success, so a denied ownership rejection can leave its button stuck. The new silent-call split menu also needs coverage. The underlying useJoinCall still dispatches the wrapped Vuex joinCall, preserving that lower-level claim path; this does not preserve custom UI recovery or explicit leave behavior. Adapt the actual new join/leave UI integration or defer this frontend advance. Passing compilation or the cleanup loader cannot establish compatibility.
5. **Window persistence needs two-window acceptance.** [afabffd80ee630c3501dccc0e2e6c62b24e321b3](https://github.com/nextcloud/talk-desktop/commit/afabffd80ee630c3501dccc0e2e6c62b24e321b3) names ordinary windows `talk-primary` and enables Electron state persistence; secondary sizing remains non-persistent. Our call promotion creates another ordinary Talk window, so both promoted call and new main share that persisted name. Review saved geometry across promotion, close and restart before release. No call ownership rewrite is inferred from a clean merge.

## Desktop patch assessment

Application/source patches were read in full across authentication, preload, shared theming, settings, favicon, welcome, window creation, build configuration and webpack. Dependency package version/lock structure and build/CI patches were inspected; transitive dependency implementation and changelogs were not exhaustively reviewed. Generated translations and style assets are grouped below; no semantic translation or full visual CSS audit is claimed.

| Group | Recommendation and evidence | Required regression checks |
| --- | --- | --- |
| Talk npm migration, package pins and build scripts | Adapt custom nested imports/test paths; retain resolved-path webpack wrappers. Release preparation no longer clones a frontend or accepts a frontend version argument. The merge advances Talk to v25.0.3, not merely desktop fixes. Defer final frontend approval pending separate review. | Clean install, actual Talk source loader test, renderer build, call action entry points, BasicInfo token wrapper, notification routing. |
| Authentication TS migration | Retain behavior and upstream null-match guard; imports in main/preload correctly target renamed files. Login minimum sizes now use minWidth/minHeight. No custom action credential boundary is removed by this patch. | Typecheck, authentication bootstrap and logout with active call; live credentials not exercised here. |
| Accessibility/theming | Potentially useful; new high-contrast IPC broadcasts to every BrowserWindow, and renderer config applies high contrast/dyslexia fonts. Custom update dialog and call title bar need visual acceptance. | Settings changes in both windows, update notice visibility/contrast and listener disposal. |
| Favicon/style extraction | Retain server favicon with built-in fallback; asset extraction prerequisite is included. Nextcloud 34 style removal changes available build targets; style overrides must match new metadata. | Domain-neutral build, favicon fallback, configured server version and local style overrides. |
| Asset-resource optimization | Retain only after packaged validation. Image/font resources move from inline to emitted URLs, potentially affecting CSP/path assumptions. OGG remains an emitted asset and custom audio hash unchanged at source. | Actual app.asar message/call hashes and startup, UI icons/fonts, media model assets. |
| Window persistence | Defer acceptance of concurrent window geometry; shared persistence name identified above. | Call promotion, fresh chats, tray and restart geometry. |
| Welcome quit-button stacking | Retain; moves quit button after wrapper in DOM without changing its handler. | Welcome screen quit action on packaged Windows client. |
| Dependency updates | Defer final compatibility/security approval; Electron 44.3.0→44.4.3, Vue 3.5.42→3.5.43, VueUse 14.4.0→15.0.0, Nextcloud Vue 9.11.0→9.13.1, router 3.1.0→3.2.0, dotenv 17.4.2→18.0.3, postcss 8.5.23→8.5.28, webpack 5.110.3→5.111.1 plus other lock changes. Major VueUse/dotenv and media transitive changes warrant actual dependency testing. | Typecheck/build on exact lock; media/notifications/update bootstrap acceptance. |
| CI/Dependabot | Review-only: upstream removes stable1 schedule/cooldowns for selected packages and adjusts auto-approval/merge policy (Talk/Electron/Nextcloud Vue remain excluded). These workflows are not evidence of local fork checks passing. | Fork workflow/approval policy review, no automatic adoption during this review. |
| README/description/translations/generated styles | Grouped lower-risk inventory, not a full language or visual audit. Deployment identities remain local. | Check generated assets and local branding in package. |
| Merge commits | Enumerated separately as graph integration records; not counted as independent fixes. Any merge-only resolution assessment remains bounded by inspected net source patches. | No claim of individual merge-resolution exhaustive review. |

## Official source checks and remaining frontend work

Checked on 2026-10-06 UTC: [desktop advisories](https://github.com/nextcloud/talk-desktop/security/advisories), [Talk advisories](https://github.com/nextcloud/spreed/security/advisories), [v25.0.2 release](https://github.com/nextcloud-releases/spreed/releases/tag/v25.0.2), [v25.0.3 release](https://github.com/nextcloud-releases/spreed/releases/tag/v25.0.3), [npm migration PR](https://github.com/nextcloud/talk-desktop/pull/1925), and [window persistence PR](https://github.com/nextcloud/talk-desktop/pull/1921). The two repository advisory pages showed no published advisories; this is not proof that dependencies or deployed server versions are unaffected.

The v25.0.3 notes mention public-share verification expiry/rate limiting and share-password fixes, as well as frontend call-menu changes. Server PHP fixes are not deployed by packaging this desktop frontend; do not claim the desktop upgrade patches a server. The full v25.0.0→v25.0.3 source history, v25.0.1 changes, dependency advisories, prerequisites and affected-version mapping remain due. No CVE or exploitability claim is made. Revisit before integration approval or release, whichever is earlier.

## Validation evidence

Validation results are appended below when complete. Initial Node invocation before dependencies were installed passed 90 tests and failed two suite loads: missing @vue/compiler-sfc and the obsolete hardcoded spreed path. This is not a green suite. An early typecheck invocation before install completion failed because vue-tsc was unavailable, not because TypeScript completed.

No authenticated calls/clipboard/notifications, installer installation, deployment, signing, macOS qualification or release publication was performed. No application process was killed.

## Ledger

No complete-review timestamp or reviewedThrough cursor is advanced. All 76 desktop commits are inventoried below, but frontend history, dependency security assessment and end-to-end compatibility remain partial. Keep the last trustworthy cursor (currently absent). Adoption state remains a proposed integration under validation, with no merge commit or push from this worktree.

## Exact desktop inventory

The following lists every commit in topological order. Labels classify scope, not a claim that title inspection constitutes full review; assessment depth is described above.

- [4552b4c259645cff9910b27106b772abaa760e34](https://github.com/nextcloud/talk-desktop/commit/4552b4c259645cff9910b27106b772abaa760e34) — chore(deps): Bump @nextcloud/vue from 9.11.0 to 9.12.0 — dependencies: partial
- [a30103a6307c2dd764836f90a2d8e75c61e56e2b](https://github.com/nextcloud/talk-desktop/commit/a30103a6307c2dd764836f90a2d8e75c61e56e2b) — Merge pull request #1920 from nextcloud/dependabot/npm_and_yarn/nextcloud/vue-9.12.0 — merge inventory
- [94606e13be038ccfbe26c940a5165c7794bcfaa6](https://github.com/nextcloud/talk-desktop/commit/94606e13be038ccfbe26c940a5165c7794bcfaa6) — build(styles): fixed versionCommitHash size — styles: partial visual audit
- [de959327c9f068603a5b79da664d0a629f61adf5](https://github.com/nextcloud/talk-desktop/commit/de959327c9f068603a5b79da664d0a629f61adf5) — Merge pull request #1922 from nextcloud/build/defined-hash-size-styles — merge inventory
- [afabffd80ee630c3501dccc0e2e6c62b24e321b3](https://github.com/nextcloud/talk-desktop/commit/afabffd80ee630c3501dccc0e2e6c62b24e321b3) — feat(talk): preserve primary window position — source/build assessment
- [674906e8ccd495c26d81131975b3997c150442d8](https://github.com/nextcloud/talk-desktop/commit/674906e8ccd495c26d81131975b3997c150442d8) — Merge pull request #1921 from nextcloud/fix/preserve-window-position — merge inventory
- [eb9620184df64f6c8bf2bb3c4736a36eb841d0b0](https://github.com/nextcloud/talk-desktop/commit/eb9620184df64f6c8bf2bb3c4736a36eb841d0b0) — perf: do not bundle all talk assets in every JS entrypoint — source/build assessment
- [9b0947f47b3007cb3b5502804b02c8ad1cbebc9e](https://github.com/nextcloud/talk-desktop/commit/9b0947f47b3007cb3b5502804b02c8ad1cbebc9e) — Merge pull request #1923 from nextcloud/build/bundle-size — merge inventory
- [94154067e07aabea6a060912d3cb991be3c8a544](https://github.com/nextcloud/talk-desktop/commit/94154067e07aabea6a060912d3cb991be3c8a544) — build(deps): add github:nextcloud-releases/spreed — dependencies: partial
- [93ad84ffae9667ea53d1181959d9ee03024bff2e](https://github.com/nextcloud/talk-desktop/commit/93ad84ffae9667ea53d1181959d9ee03024bff2e) — build(talk): use Talk as npm dep instead of manually cloned — source/build assessment
- [1d06516805c999d8f0060dcd04fe441f452c702c](https://github.com/nextcloud/talk-desktop/commit/1d06516805c999d8f0060dcd04fe441f452c702c) — build(scripts): remove update-built-in-talk — source/build assessment
- [a2a508fd0a22465c85133a287ecc38ce40859fa6](https://github.com/nextcloud/talk-desktop/commit/a2a508fd0a22465c85133a287ecc38ce40859fa6) — build(scripts): remove spreed clone in prepare-release-packages — source/build assessment
- [0bb87d9f83776eedb66cef501041be232664d3cc](https://github.com/nextcloud/talk-desktop/commit/0bb87d9f83776eedb66cef501041be232664d3cc) — chore(README): update dev setup with Talk as npm dep — source/build assessment
- [44e9955fd09d3bc032c85ff782108186a12dcf84](https://github.com/nextcloud/talk-desktop/commit/44e9955fd09d3bc032c85ff782108186a12dcf84) — Merge pull request #1925 from nextcloud/build/talk-as-dep — merge inventory
- [49ca9a683acc9ced34eebbe01b3f72462c7beeac](https://github.com/nextcloud/talk-desktop/commit/49ca9a683acc9ced34eebbe01b3f72462c7beeac) — build(styles): remove Nextcloud 34 styles — styles: partial visual audit
- [4498a7ed0331290252ebc3b0758a4eddd3f60429](https://github.com/nextcloud/talk-desktop/commit/4498a7ed0331290252ebc3b0758a4eddd3f60429) — build(styles): update Nextcloud 35 and 36 (master) styles — styles: partial visual audit
- [d8e572997fbf10faf28af5f4c8290ab3834de1ce](https://github.com/nextcloud/talk-desktop/commit/d8e572997fbf10faf28af5f4c8290ab3834de1ce) — Merge pull request #1931 from nextcloud/build/update-styles — merge inventory
- [8f8c5adad377dafefdc8f58c7ed7a389c5d6ace2](https://github.com/nextcloud/talk-desktop/commit/8f8c5adad377dafefdc8f58c7ed7a389c5d6ace2) — build(styles): also extract favicon.ico — styles: partial visual audit
- [d5d986830b4ae932112baec31d3dd2e818861305](https://github.com/nextcloud/talk-desktop/commit/d5d986830b4ae932112baec31d3dd2e818861305) — build(styles): re-extract with favicon.ico — styles: partial visual audit
- [17054c3353092a8c1cabca11256d0769fee422ce](https://github.com/nextcloud/talk-desktop/commit/17054c3353092a8c1cabca11256d0769fee422ce) — fix(title-bar): use actual favicon as server logo in the menu — source/build assessment
- [7d30c6dbf691b652b843067967929e9f27e2806b](https://github.com/nextcloud/talk-desktop/commit/7d30c6dbf691b652b843067967929e9f27e2806b) — Merge pull request #1932 from nextcloud/fix/favicon — merge inventory
- [bf450aa4774868a91917893f4eb2612b500040f6](https://github.com/nextcloud/talk-desktop/commit/bf450aa4774868a91917893f4eb2612b500040f6) — feat(config): add high contrast toggle and dyslexia font — source/build assessment
- [97c9fc45dabf32a5e5af4005eb348e7bd85c2a90](https://github.com/nextcloud/talk-desktop/commit/97c9fc45dabf32a5e5af4005eb348e7bd85c2a90) — Merge pull request #1930 from nextcloud/feat/a11y-themes — merge inventory
- [37acb9c4667d9d4c6b4dcd533496070480aa0e58](https://github.com/nextcloud/talk-desktop/commit/37acb9c4667d9d4c6b4dcd533496070480aa0e58) — fix(l10n): Update translations from Transifex — translations: grouped inventory
- [c084fd4de57b5707ea7b726db66554b0ae8f3cba](https://github.com/nextcloud/talk-desktop/commit/c084fd4de57b5707ea7b726db66554b0ae8f3cba) — chore(deps): Bump @vueuse/core from 14.4.0 to 15.0.0 — dependencies: partial
- [dcd3a1a40bc8c82be10b7c025c8cdf86a47a9405](https://github.com/nextcloud/talk-desktop/commit/dcd3a1a40bc8c82be10b7c025c8cdf86a47a9405) — Merge pull request #1934 from nextcloud/dependabot/npm_and_yarn/vueuse/core-15.0.0 — merge inventory
- [e797bd14312c97d58dc12a9f261b6deb59577fc0](https://github.com/nextcloud/talk-desktop/commit/e797bd14312c97d58dc12a9f261b6deb59577fc0) — chore(deps): Bump vue from 3.5.42 to 3.5.43 — dependencies: partial
- [573401f269a8ad53392a7c9f1d6b97d9ead1cb0f](https://github.com/nextcloud/talk-desktop/commit/573401f269a8ad53392a7c9f1d6b97d9ead1cb0f) — Merge pull request #1937 from nextcloud/dependabot/npm_and_yarn/vue-3.5.43 — merge inventory
- [f8127a65dc863d916e3dde0d0403dd36165c6998](https://github.com/nextcloud/talk-desktop/commit/f8127a65dc863d916e3dde0d0403dd36165c6998) — chore(deps-dev): Bump dotenv from 17.4.2 to 18.0.0 — dependencies: partial
- [22e348706dbf531694c212f0aac443c5ee93a0d6](https://github.com/nextcloud/talk-desktop/commit/22e348706dbf531694c212f0aac443c5ee93a0d6) — Merge pull request #1935 from nextcloud/dependabot/npm_and_yarn/dotenv-18.0.0 — merge inventory
- [c22e7d970e33dc69fbbe8fb37125ddfff7cf143b](https://github.com/nextcloud/talk-desktop/commit/c22e7d970e33dc69fbbe8fb37125ddfff7cf143b) — chore(deps-dev): Bump webpack from 5.110.3 to 5.111.0 — dependencies: partial
- [1b320d30d68f08004dc903ee34056ee8cf8dde94](https://github.com/nextcloud/talk-desktop/commit/1b320d30d68f08004dc903ee34056ee8cf8dde94) — Merge pull request #1936 from nextcloud/dependabot/npm_and_yarn/webpack-5.111.0 — merge inventory
- [4cf8c00c6108cd9569f19a2452edd7c07fe6e1a5](https://github.com/nextcloud/talk-desktop/commit/4cf8c00c6108cd9569f19a2452edd7c07fe6e1a5) — chore(deps-dev): Bump dotenv from 18.0.0 to 18.0.1 — dependencies: partial
- [8c7fc1fa9778c5267ee683ec78d5a332f48ea7e2](https://github.com/nextcloud/talk-desktop/commit/8c7fc1fa9778c5267ee683ec78d5a332f48ea7e2) — Merge pull request #1940 from nextcloud/dependabot/npm_and_yarn/dotenv-18.0.1 — merge inventory
- [afa61b48b72792c3be4ded690b59626afc99a535](https://github.com/nextcloud/talk-desktop/commit/afa61b48b72792c3be4ded690b59626afc99a535) — chore(deps-dev): Bump sass from 1.104.0 to 1.104.1 — dependencies: partial
- [c7bb9f92a82eb5e7b454c438b476a1a236968a30](https://github.com/nextcloud/talk-desktop/commit/c7bb9f92a82eb5e7b454c438b476a1a236968a30) — Merge pull request #1942 from nextcloud/dependabot/npm_and_yarn/sass-1.104.1 — merge inventory
- [c4e9cc9b2eeda65f2b4a75ebe82876102bfbd304](https://github.com/nextcloud/talk-desktop/commit/c4e9cc9b2eeda65f2b4a75ebe82876102bfbd304) — fix(l10n): Update translations from Transifex — translations: grouped inventory
- [6cc5647396412c6f2dd9fdd13d2e57fac4a8b03c](https://github.com/nextcloud/talk-desktop/commit/6cc5647396412c6f2dd9fdd13d2e57fac4a8b03c) — chore(deps): Bump @nextcloud/router from 3.1.0 to 3.2.0 — dependencies: partial
- [b5757bc8dc5e050e89f04b790790c5274dea5f45](https://github.com/nextcloud/talk-desktop/commit/b5757bc8dc5e050e89f04b790790c5274dea5f45) — Merge pull request #1943 from nextcloud/dependabot/npm_and_yarn/nextcloud/router-3.2.0 — merge inventory
- [561a5eeb163255f438b84562d02149bbce5e8be6](https://github.com/nextcloud/talk-desktop/commit/561a5eeb163255f438b84562d02149bbce5e8be6) — ci(dependabot): allow postcss updates again — CI policy
- [5ef0cc6cb10a41d43548b7362383fb879628c346](https://github.com/nextcloud/talk-desktop/commit/5ef0cc6cb10a41d43548b7362383fb879628c346) — build(deps-dev): postcss 8.5.23 exact -> ^8.5.28 — dependencies: partial
- [c6a73e95181c630d0e3501e3b8a2c5c304dca143](https://github.com/nextcloud/talk-desktop/commit/c6a73e95181c630d0e3501e3b8a2c5c304dca143) — Merge pull request #1946 from nextcloud/build/postcss — merge inventory
- [ab15159d63937fd1dadc18ac3ac98e83db4df28f](https://github.com/nextcloud/talk-desktop/commit/ab15159d63937fd1dadc18ac3ac98e83db4df28f) — chore(deps): Bump webdav from 5.10.0 to 5.11.0 — dependencies: partial
- [4ac046baf57d069e13a2572eaf08d91c9d35b83d](https://github.com/nextcloud/talk-desktop/commit/4ac046baf57d069e13a2572eaf08d91c9d35b83d) — Merge pull request #1951 from nextcloud/dependabot/npm_and_yarn/webdav-5.11.0 — merge inventory
- [c3750e8b737a08594a75ee5e90f7439213bcf769](https://github.com/nextcloud/talk-desktop/commit/c3750e8b737a08594a75ee5e90f7439213bcf769) — chore(deps-dev): Bump webpack from 5.111.0 to 5.111.1 — dependencies: partial
- [70246e211b40b2d2af1d79b664bc8a859593174f](https://github.com/nextcloud/talk-desktop/commit/70246e211b40b2d2af1d79b664bc8a859593174f) — Merge pull request #1954 from nextcloud/dependabot/npm_and_yarn/webpack-5.111.1 — merge inventory
- [899a99b6a7328d1aac2db4907e8884542cf392f5](https://github.com/nextcloud/talk-desktop/commit/899a99b6a7328d1aac2db4907e8884542cf392f5) — chore(deps-dev): Bump eslint from 10.10.0 to 10.11.0 — dependencies: partial
- [f1986fb762d62b65407b24a60243e0abbd4c8bb2](https://github.com/nextcloud/talk-desktop/commit/f1986fb762d62b65407b24a60243e0abbd4c8bb2) — Merge pull request #1956 from nextcloud/dependabot/npm_and_yarn/eslint-10.11.0 — merge inventory
- [205a5bd5c56ffd19d1405d1246f358737220c234](https://github.com/nextcloud/talk-desktop/commit/205a5bd5c56ffd19d1405d1246f358737220c234) — ci(dependabot): remove stable1 — CI policy
- [f77b463496b8de9a2f84245297534bb9dc492fcf](https://github.com/nextcloud/talk-desktop/commit/f77b463496b8de9a2f84245297534bb9dc492fcf) — ci(dependabot): remove cooldown for talk and @nextcloud/* — CI policy
- [a07c64df5214d7464b3e623a305d519029384b19](https://github.com/nextcloud/talk-desktop/commit/a07c64df5214d7464b3e623a305d519029384b19) — ci(dependabot): update dependabot-approve-merge.yml — CI policy
- [a9043e284f577b2c8d1e48da813857832395b008](https://github.com/nextcloud/talk-desktop/commit/a9043e284f577b2c8d1e48da813857832395b008) — ci(dependabot): do not auto-approve talk update — CI policy
- [377cfee73f4868e2a2c7c5b054eed6e121837b1c](https://github.com/nextcloud/talk-desktop/commit/377cfee73f4868e2a2c7c5b054eed6e121837b1c) — chore(deps): specify concrete Talk version — dependencies: partial
- [282e7121dc78bfad6b3af256aeffdb8154d6beb0](https://github.com/nextcloud/talk-desktop/commit/282e7121dc78bfad6b3af256aeffdb8154d6beb0) — Merge pull request #1945 from nextcloud/build/dependabot-spreed — merge inventory
- [69dd1112eb98498d72a5f1696c71f8f6073f2fa4](https://github.com/nextcloud/talk-desktop/commit/69dd1112eb98498d72a5f1696c71f8f6073f2fa4) — chore(deps): Bump @nextcloud/vue from 9.12.0 to 9.13.1 — dependencies: partial
- [54268da861c730897b685139b503e0fefbeb36d6](https://github.com/nextcloud/talk-desktop/commit/54268da861c730897b685139b503e0fefbeb36d6) — Merge pull request #1960 from nextcloud/dependabot/npm_and_yarn/nextcloud/vue-9.13.1 — merge inventory
- [70a9aede75013f33413d99afe93610375a2a9511](https://github.com/nextcloud/talk-desktop/commit/70a9aede75013f33413d99afe93610375a2a9511) — chore(deps-dev): Bump electron from 44.3.0 to 44.4.3 — dependencies: partial
- [fe68994227956294eed044b0249f87ac9f38c252](https://github.com/nextcloud/talk-desktop/commit/fe68994227956294eed044b0249f87ac9f38c252) — Merge pull request #1944 from nextcloud/dependabot/npm_and_yarn/electron-44.4.3 — merge inventory
- [8b88e03991125964094bbb430d635b92335c89b2](https://github.com/nextcloud/talk-desktop/commit/8b88e03991125964094bbb430d635b92335c89b2) — chore(deps): Bump talk from v25.0.0 to v25.0.2 — dependencies: partial
- [25c507fdb7cefe8d2c4d351d6ed47771938cba42](https://github.com/nextcloud/talk-desktop/commit/25c507fdb7cefe8d2c4d351d6ed47771938cba42) — Merge pull request #1959 from nextcloud/dependabot/npm_and_yarn/talk-v25.0.2 — merge inventory
- [702b913ff0db90a068ba0c7117106d97e14355c0](https://github.com/nextcloud/talk-desktop/commit/702b913ff0db90a068ba0c7117106d97e14355c0) — fix(l10n): Update translations from Transifex — translations: grouped inventory
- [00927e8c4325a75414c6f646e093f6fc1bd86285](https://github.com/nextcloud/talk-desktop/commit/00927e8c4325a75414c6f646e093f6fc1bd86285) — refactor(authentication): rename main process files to .ts — source/build assessment
- [ffa41dfdfc222d6fd190a524a6ce9457c98c547d](https://github.com/nextcloud/talk-desktop/commit/ffa41dfdfc222d6fd190a524a6ce9457c98c547d) — refactor(authentication): migrate main process to TS — source/build assessment
- [74fade07d7325b06039e8c45bd50bc9c8ded7fc7](https://github.com/nextcloud/talk-desktop/commit/74fade07d7325b06039e8c45bd50bc9c8ded7fc7) — Merge pull request #1961 from nextcloud/refactor/authentication-ts — merge inventory
- [b1f09bf1a1175b486a42124d583733b7dba95327](https://github.com/nextcloud/talk-desktop/commit/b1f09bf1a1175b486a42124d583733b7dba95327) — build: update app description — source/build assessment
- [11cdc77320029b172b7932d844d1867881a9ec3f](https://github.com/nextcloud/talk-desktop/commit/11cdc77320029b172b7932d844d1867881a9ec3f) — chore(README): update short description — source/build assessment
- [859eba3bf325f658003becd17c7d283fb7be1922](https://github.com/nextcloud/talk-desktop/commit/859eba3bf325f658003becd17c7d283fb7be1922) — Merge pull request #1947 from nextcloud/fix/description — merge inventory
- [2e9cb1c27cbca3ff14404dc0a8debd7cbb2aa62d](https://github.com/nextcloud/talk-desktop/commit/2e9cb1c27cbca3ff14404dc0a8debd7cbb2aa62d) — fix(welcome): quit button is not clickable — source/build assessment
- [e80ff97fb5562c6b17f814fd43de731c84f2fc84](https://github.com/nextcloud/talk-desktop/commit/e80ff97fb5562c6b17f814fd43de731c84f2fc84) — Merge pull request #1963 from nextcloud/fix/welcome-quit — merge inventory
- [1713ce6f76b50326f6193d88b0592c8d066e048f](https://github.com/nextcloud/talk-desktop/commit/1713ce6f76b50326f6193d88b0592c8d066e048f) — fix(l10n): Update translations from Transifex — translations: grouped inventory
- [4aec5e9526060e03ce0ef9954ca55fff2970c2ff](https://github.com/nextcloud/talk-desktop/commit/4aec5e9526060e03ce0ef9954ca55fff2970c2ff) — chore(deps-dev): Bump sass from 1.104.1 to 1.105.0 — dependencies: partial
- [9f2322886908a4a2b7188b6f6869617878f052a6](https://github.com/nextcloud/talk-desktop/commit/9f2322886908a4a2b7188b6f6869617878f052a6) — Merge pull request #1964 from nextcloud/dependabot/npm_and_yarn/sass-1.105.0 — merge inventory
- [127da67285d1b72ae8cdb12e8ee65588e5cdf8c9](https://github.com/nextcloud/talk-desktop/commit/127da67285d1b72ae8cdb12e8ee65588e5cdf8c9) — chore(deps-dev): Bump dotenv from 18.0.1 to 18.0.3 — dependencies: partial
- [bfe1116d4e0bd14e873c8065d34f8746e0b679a3](https://github.com/nextcloud/talk-desktop/commit/bfe1116d4e0bd14e873c8065d34f8746e0b679a3) — Merge pull request #1966 from nextcloud/dependabot/npm_and_yarn/dotenv-18.0.3 — merge inventory
- [00048ba16af858b4e36cd44b54df90c843f60d3b](https://github.com/nextcloud/talk-desktop/commit/00048ba16af858b4e36cd44b54df90c843f60d3b) — chore(deps): Bump talk from v25.0.2 to v25.0.3 — dependencies: partial
- [f45e9bcba5ce1c5c669fec52b565393f0b49c0a2](https://github.com/nextcloud/talk-desktop/commit/f45e9bcba5ce1c5c669fec52b565393f0b49c0a2) — Merge pull request #1965 from nextcloud/dependabot/npm_and_yarn/talk-v25.0.3 — merge inventory


## Exact-lock validation follow-up

- Isolated `npm ci --ignore-scripts --allow-git=all --no-audit --no-fund` completed successfully, 1225 packages. `package-lock.json` remained unchanged. Electron install was then run explicitly. Installed versions verified: Talk 25.0.3, Electron 44.4.3, Vue/compiler-sfc 3.5.43. No shared dependency tree was modified.
- `npm run ts:check`: PASS on the combined tree and its own dependencies. This check intentionally excludes full Talk typing via the existing ambient `@talk/*` declaration and cannot detect the options-wrapper contract break.
- Twelve custom Node suites: 100 tests PASS, 0 failures (call manager/actions, action transport/widget, updater, release authoring/IO/staging, notice component/state, notification, preload). The existing cleanup test was excluded from this invocation because of its confirmed obsolete path.
- Cleanup source test: two tests PASS against installed Talk 25.0.3 after replacing only the hardcoded source-path expression **in memory** with `resolveTalkPath()`. No tracked test was changed, and the original test command is still broken until adapted. Separately, the cleanup loader accepted the exact official v25.0.3 source and inserted four optional destroy guards.
- Electron 44.4.3 synthetic call-window smoke: PASS, process exit 0, captured expected PASS message. It uses a fresh temporary profile and hidden windows with synthetic media; it does not qualify authenticated camera/microphone/screen sharing or new frontend call-button paths.
- Source comparison against locally verified v25.0.0 checkout: participantsStore.js, callsService.ts and BasicInfo.vue are unchanged apart from line endings; webrtc/index.js changes only SignalingTypingHandler construction outside cleanup. StoreConfig still imports ./participantsStore.js and participantsStore still imports ../services/callsService.ts, so those webpack interception sites remain present.
- Installed v25.0.3 confirms explicit leave moved to `CallView/CallEndLeaveButton.vue`; its Vuex leave payload lacks `desktopExplicitLeave`. Consequently the fork's automatic call-window release no longer runs for that UI leave path. Native close lifecycle has a separate explicit payload and is not evidence the UI path works.
- Stable Windows x64 build launched with the default neutral profile: no domain, no update feed, Talk resolved to node_modules/talk 25.0.3 and styles to 35. Build result recorded below.
- Installed compiler-sfc parse/compileScript confirms both new call buttons have script-setup only, no options methods; handleJoinCall/leaveCall are setup-const bindings. This is direct contract evidence, not a title-only inference. Adaptation must preserve the silent parameter, voice-room leave navigation, and breakout parent-room switch semantics.
- Stable Windows x64 build: **FAIL**, exit 1. Webpack completed main/preload compilation but renderer compilation reported exactly three unresolved imports of `@talk/node_modules/@nextcloud/dialogs/dist/index.mjs`, in CallButton.js, callWindowLifecycle.js and participantsStore.js. There was also one MediaPipe dynamic-dependency warning. No new installer or qualified packaged archive was produced, so packaged audio/startup validation is not claimed.
- Read-only ESLint of custom call-window/identifier/action/update modules plus updater/manifest/main/preload/webpack: exit 0, no errors, two existing jsdoc `any` warnings in preload lines 119 and 149. No `--fix` was used.
- Final checked index tree remains 5a52f9cecad313da728227dc68f460947f46812a; runtime tracked files and lock were not altered. This report is an untracked documentation addition for the parent integration task to review. No merge commit, push, ledger advancement or release was performed here.

Initial recommendation: adapt the confirmed build and script-setup integration breaks before integration. The authorized adaptation below supersedes the initial build blockers; authenticated acceptance and the separate frontend/dependency review remain incomplete.


## Authorized compatibility adaptation

The owner subsequently explicitly authorized combining all work into fork main. This authorized integration does not authorize a release, deployment or publication. The following targeted adaptation preserves the existing custom behavior on the frontend already present in main:

- Replace nested dialogs imports with its exported package entry; remove the obsolete options-method CallButton wrapper.
- Patch the actual Talk 25.0.3 script-setup join and leave callbacks using a fail-closed preloader. It checks full original callbacks and required token/loading/store bindings before applying. Silent-call parameters, recording consent and recording-start options are forwarded. Failed/denied join restores loading. Promoted-window explicit leave dispatches the existing confirmed store flow with desktopExplicitLeave and only releases after success; failure displays an error and remains retryable. Owner voice rooms use that confirmed close path instead of racing a navigation-triggered leave. Non-owner voice-room navigation and breakout switching remain upstream behavior; reconnect/implicit leave is not marked explicit.
- Resolve the cleanup test through the same frontend resolver as webpack.
- Electron 44 requires every live named window to have a unique name and throws on duplicates. Initial primary geometry remains persistent; replacement chats are unnamed/nonpersistent while the original renderer owns the primary name. External windows are also unnamed/nonpersistent. This intentionally preserves the initial window's geometry rather than allowing competing windows to overwrite it.
- Translate Open chats and Return to call through the existing l10n API. Update CUSTOMIZATION.md and the review context for current npm/frontend pins and build caveats. Package version and tracked npm Git-fetch policy remain unchanged.

Provenance: callback adaptation from [the pinned release tree](https://github.com/nextcloud-releases/spreed/commit/3c8cd64865fb05a257fc43404dc281ba333427fa), specifically TopBar/CallButton.vue and CallView/CallEndLeaveButton.vue. Original copyright/license notices are retained in the adaptation. Upstream rendering and menus are not copied; only the bounded callbacks are transformed during build.

Validation of the adapted candidate:

- Full custom Node suites: 109 tests passed, including six tests executing real patched script-setup callbacks, resolved-source cleanup tests and the actual desktop factory's window-name options. Coverage includes silent joins/recording flags, rejected ownership loading recovery, explicit end/leave and voice rooms, failure retry, non-owner behavior, breakout transfer and upstream binding/callback drift rejection.
- Typecheck passed. Targeted ESLint passed without errors or warnings after formatting the new tests.
- Electron 44.4.3 synthetic smoke passed with a named persistent initial window and independent replacement main. Media renderer continuity and cancelled/confirmed close behavior passed; this is not authenticated media acceptance.
- An initial successful build revealed the Vue script subrequests bypassed a query-restricted preloader. Packaged-bundle inspection caught the missing patched callback before commit. The query restriction was removed. New permanent scripts/verify-call-window-package.cjs rejects packages lacking the injected join and explicit-leave callbacks; it correctly failed that earlier package. Final rebuilt package results follow below.

This remains a PARTIAL upstream review: all 76 desktop commits are inventoried, but no complete frontend history/security/dependency cursor is asserted. Live call/media/clipboard/notifications and macOS/native updater qualification remain release acceptance work. The merge does not deploy the server-side fixes mentioned in frontend release notes.

Final rebuilt package: stable Windows x64 build exited 0, with built-in Talk 25.0.3. Both permanent package verifiers passed: original call audio and custom message SHA256 001cd78615b585e6b3ff883dd88f533a5ed8762cf5928efa7b3ce8af25eba1ff are present, version remains 2.3.5, and the emitted renderer contains both patched callbacks. app.asar SHA256: b24a6aa77aef1938203da84570157c97ef3e42742431083f2597c72b33650fff.

Packaged main-process startup passed via an unknown-command probe under a fresh unique executable identity (the application derives its profile directory from the executable name). It printed the expected unknown-command message and exited 1 as designed, before creating the authenticated UI. The temporary executable copy was removed. No existing user profile, credentials, application process, installer installation, release feed or deployment was touched. This is a packaged CLI bootstrap check, not a full rendered/authenticated UI qualification. The artifact is a local neutral application package, not a signed or published installer.

The final merge commit containing this report identifies the adapted source. Its parents are the immutable main and custom SHAs listed above. The initial tree hash remains historical evidence only; no complete-review ledger cursor is advanced by this integration.
