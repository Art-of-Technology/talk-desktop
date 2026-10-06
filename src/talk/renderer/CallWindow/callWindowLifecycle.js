/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { showError } from '@nextcloud/dialogs'
import { useActorStore } from '@talk/src/stores/actor.ts'
import { useTokenStore } from '@talk/src/stores/token.ts'
import { callWindowState } from './callWindowState.ts'

/** Install after Talk has mounted and its Pinia instance exists. */
export function installCallWindowLifecycle() {
	let leaving = false
	return window.TALK_DESKTOP.onCallLeaveRequested(async () => {
		if (!callWindowState.isCallWindow || leaving) {
			return
		}
		leaving = true
		try {
			const instance = window.OCA.Talk.instance
			const actorStore = useActorStore(instance.$pinia)
			const tokenStore = useTokenStore(instance.$pinia)
			await instance.$store.dispatch('leaveCall', {
				token: tokenStore.token,
				participantIdentifier: actorStore.participantIdentifier,
				desktopExplicitLeave: true,
			})
		} catch (error) {
			console.error('Could not close the call window', error)
			showError('Could not leave the call. Please try again.')
		} finally {
			leaving = false
		}
	})
}
