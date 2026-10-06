# Separate desktop call window

Keep the renderer that owns the call alive: on joining, promote that window to
the call window and create a fresh main chat window. Never reload or transfer a
live WebRTC connection. The call window hides unrelated navigation and provides
an Open chats button. The main window retains normal chat/file navigation.

## Tasks

1. Main process: manage one call window, transfer tray ownership to the new main
   window, authenticate IPC senders, focus an existing call instead of allowing
   a second call, and clean up call windows on logout/account changes.
2. Renderer: wrap the pinned Talk join action without editing its checkout;
   claim a call window before joining, retain existing call semantics, provide
   call-specific chrome, and route broadcasts/notifications only to main chat.
3. Review lifecycle behavior, test with fake windows and an isolated Electron
   profile, run lint/type checks and build the Windows installer. Live media
   verification must be reported separately from offline checks.

## IPC contract

- `call:claim(token)` -> boolean. Only the current main window or current call
  window may claim. Promotes the sender before returning true. Another owner
  returns false and focuses the existing call.
- `call:state()` -> `{ isCallWindow, hasCallWindow }` for the sender.
- `call:state-changed` broadcasts those per-window values after ownership changes.
- `call:release()` clears ownership only for the call renderer, closes its window
  after the renderer confirms it has left the call, and focuses main chat.
- `call:leave-requested` requests the call renderer to leave using Talk's normal
  action. Closing a call window requires confirmation; failed leave keeps it open.
- `talk:focus` always opens main chat.

## Acceptance

- Starting or accepting a call yields one call window and one main chat window.
- Main chat navigation does not route/reload the call renderer.
- Repeated/parallel call requests cannot create multiple live calls.
- Call navigation and breakout transitions retain the original Talk behavior.
- Only main chat handles native notifications, badges and incoming-call popups.
- Closing main chat to tray preserves the meeting; closing the call uses Talk's
  leave flow. Logout/account changes close both windows.
- No deployment-specific branding enters tracked source. Preserve earlier
  Conversation ID and audio customizations. Do not change server/GPU/provider state.

## Validation result

Implemented and built as desktop 2.3.2-custom.2 for Windows x64. Twenty focused
tests pass; Vue type checking and scoped ESLint pass (only two pre-existing
generic-type warnings in preload remain). An isolated Electron test preserves
a live synthetic video track across main-window navigation. Packaged startup,
feature presence, notification/call audio and the installer's embedded archive
were verified. The installer is unsigned. No server change or installation was
performed. Real two-participant calls, incoming calls, screen sharing, breakout
transfers and macOS packaging remain unverified.
