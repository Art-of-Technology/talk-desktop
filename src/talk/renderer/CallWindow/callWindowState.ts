/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { reactive } from 'vue'

export const callWindowState = reactive({ isCallWindow: false, hasCallWindow: false })

let initialized: Promise<void> | undefined

/** Initialize ownership before importing or mounting Talk. */
export function initializeCallWindowState(): Promise<void> {
	return initialized ??= (async () => {
		let receivedEvent = false
		window.TALK_DESKTOP.onCallWindowStateChange((state: { isCallWindow: boolean, hasCallWindow: boolean }) => {
			receivedEvent = true
			Object.assign(callWindowState, state)
			document.documentElement.classList.toggle('desktop-call-window', state.isCallWindow)
		})
		const state = await window.TALK_DESKTOP.getCallWindowState()
		// A newer ownership event must not be overwritten by an older IPC read.
		if (!receivedEvent) {
			Object.assign(callWindowState, state)
			document.documentElement.classList.toggle('desktop-call-window', state.isCallWindow)
		}
	})()
}
