/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-FileCopyrightText: 2019-2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const path = require('node:path')

/**
 * Adapt the pinned script-setup callbacks without copying the upstream UI.
 *
 * @param {string} source Upstream Vue component
 */
module.exports = function callButtons(source) {
	const join = `async function handleJoinCall(silent?: boolean) {
	loading.value = true
	await joinCall(token.value, {
		silent: hasCall.value ? true : (silent ?? props.silentCall),
		recordingConsent: props.recordingConsentGiven,
		shouldStartRecording: props.isRecordingFromStart,
	})
	loading.value = false
}`
	const leave = `async function leaveCall(endMeetingForAll = false) {
	if (endMeetingForAll) {
		console.info('End meeting for everyone')
	} else {
		console.info('Leaving call')
	}

	if (isVoiceRoom.value) {
		router.push({ name: 'root' })
		// Call ending is handled in App.vue
		return
	}

	// Remove selected participant
	callViewStore.setSelectedVideoPeerId(null)
	loading.value = true

	// Open navigation
	if (!isMobile.value) {
		emit('toggle-navigation', {
			open: true,
		})
	}
	await vuexStore.dispatch('leaveCall', {
		token: token.value,
		participantIdentifier: actorStore.participantIdentifier,
		all: endMeetingForAll,
	})
	loading.value = false
}`
	const normalized = source.replaceAll('\r\n', '\n')
	const isJoin = path.basename(this.resourcePath) === 'CallButton.vue'
	const needle = isJoin ? join : leave
	const bindings = [
		'const loading = ref(false)',
		'const token = useGetToken()',
		...(isJoin
			? ['const { joinCall } = useJoinCall()']
			: ['const vuexStore = useStore()', 'const actorStore = useActorStore()']),
	]
	if (!normalized.includes('<script setup lang="ts">')
		|| normalized.split(needle).length !== 2
		|| bindings.some((binding) => normalized.split(binding).length !== 2)) {
		throw new Error('Call button patch needs review: upstream callback changed')
	}
	if (isJoin) {
		return normalized.replace(join, `async function handleJoinCall(silent?: boolean) {
	loading.value = true
	try {
		await joinCall(token.value, {
			silent: hasCall.value ? true : (silent ?? props.silentCall),
			recordingConsent: props.recordingConsentGiven,
			shouldStartRecording: props.isRecordingFromStart,
		})
	} catch (error) {
		console.debug('Call join was not completed', error)
	} finally {
		loading.value = false
	}
}`)
	}
	// The normal upstream branch (including voice-room navigation) stays intact.
	// A promoted renderer closes only after our store confirms its explicit leave.
	const statePath = JSON.stringify(path.join(__dirname, 'callWindowState.ts'))
	return normalized.replace('<script setup lang="ts">', `<script setup lang="ts">
import { showError } from '@nextcloud/dialogs'
import { callWindowState } from ${statePath}`)
		.replace(leave, `async function leaveCall(endMeetingForAll = false) {
	if (callWindowState.isCallWindow) {
		loading.value = true
		try {
			await vuexStore.dispatch('leaveCall', {
				token: token.value,
				participantIdentifier: actorStore.participantIdentifier,
				all: endMeetingForAll,
				desktopExplicitLeave: true,
			})
		} catch (error) {
			console.error('Could not leave the call from its button', error)
			showError(t('talk_desktop', 'Could not leave the call. Please try again.'))
		} finally {
			loading.value = false
		}
		return
	}
${leave.slice(leave.indexOf('\n') + 1)}`)
}
