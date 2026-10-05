/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { showError } from '@talk/node_modules/@nextcloud/dialogs/dist/index.mjs'
import CallButton from '@talk/src/components/TopBar/CallButton.vue'
import { callWindowState } from './callWindowState.ts'

export default {
	...CallButton,
	methods: {
		...CallButton.methods,
		async handleJoinCall() {
			try {
				await CallButton.methods.handleJoinCall.call(this)
			} catch (error) {
				console.debug('Call join was not completed', error)
			} finally {
				this.loading = false
			}
		},
		async leaveCall(all = false) {
			if (!callWindowState.isCallWindow) {
				return CallButton.methods.leaveCall.call(this, all)
			}
			this.loading = true
			try {
				await this.$store.dispatch('leaveCall', {
					token: this.token,
					participantIdentifier: this.actorStore.participantIdentifier,
					all,
					desktopExplicitLeave: true,
				})
			} catch (error) {
				console.error('Could not leave the call', error)
				showError('Could not leave the call. Please try again.')
			} finally {
				this.loading = false
			}
		},
	},
}
