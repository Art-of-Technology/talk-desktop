# Desktop focus and fork update source

1. Keep the call owner focused when promoting it; show the replacement chat
   window without activation once it loads. Verify existing lifecycle tests.
2. Replace the upstream release menu/checks with our native updater. Provide an
   optional HTTPS Squirrel feed URL in ignored build configuration. No feed means
   no network request. Show checking, downloading, ready and error states. Apply
   downloaded updates through Restart to update, blocked during an active call.
   Squirrel also applies downloaded updates at the next normal app start; never
   force a restart. Retain account data and the existing installation identity.
3. Review and build a new Windows installer, verify its archive/audio and
   startup, and deliver checksum. Hosting/publication requires a selected
   destination; do not publish branded metadata to the source organization.

Windows uses Electron's built-in Squirrel updater and RELEASES/full-nupkg feed.
The initial updater-enabled build must be installed manually. macOS automatic
updates require a separately qualified signed build and feed, not a Windows
validation claim. Stage release files with the original names required by the
Squirrel manifest; current generic artifact renaming must not break that feed.
