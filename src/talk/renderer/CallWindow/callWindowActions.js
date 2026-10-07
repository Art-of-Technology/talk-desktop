/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Wrap Talk's actions without transferring its signaling or media session.
 * Only an explicit user leave can release the window: disconnected state also
 * occurs during reconnects, lobby changes and breakout transitions.
 *
 * @param {object} original Original actions
 * @param {object} bridge Desktop window bridge
 */
export function createCallWindowActions(original, bridge) {
	let joinsPending = 0
	let canceled = false
	let generation = null
	let registration = null
	return {
		...original,
		async joinCall(context, payload) {
			if (canceled) {
				throw new Error('The call was canceled')
			}
			if (!payload.participantIdentifier?.sessionId) {
				throw new Error('Cannot join a call without an active conversation session')
			}
			const participant = context.getters.findParticipant(payload.token, payload.participantIdentifier)
			if (!participant) {
				throw new Error('Cannot join a call without an active conversation session')
			}
			if (joinsPending) {
				throw new Error('A call is already connecting in this window')
			}
			joinsPending++
			try {
				// Reserve before claim yields: native close may arrive as soon as
				// the main process promotes this renderer into a call window.
				registration = (async () => {
					if (!await bridge.claim(payload.token)) {
						bridge.denied()
						throw new Error('A call is already open in another window')
					}
					return bridge.setJoining(null)
				})()
				generation = await registration
				if (!generation || canceled) {
					throw new Error('The call was canceled')
				}
				let confirmed = false
				const result = await original.joinCall({
					...context,
					commit(type, data, ...rest) {
						context.commit(type, data, ...rest)
						// The pinned store swallows transport/media failures. Only its
						// post-request participant update proves the request succeeded;
						// setInCall can also be emitted optimistically before a failure.
						if (type === 'updateParticipant' && data.token === payload.token
							&& data.attendeeId === participant.attendeeId
							&& data.updatedData?.inCall > 0) {
							confirmed = true
						}
					},
				}, payload)
				if (canceled || !confirmed) {
					throw new Error(canceled ? 'The call was canceled' : 'The call could not be joined')
				}
				return result
			} finally {
				const completedGeneration = generation
				generation = null
				joinsPending--
				if (!canceled && completedGeneration) {
					await bridge.setJoining(completedGeneration)
				}
			}
		},
		async leaveCall(context, payload) {
			if (payload.desktopExplicitLeave && joinsPending) {
				canceled = true
				// Disposing the renderer is essential: upstream getUserMedia has no
				// abort signal and may otherwise start signaling after permission.
				// Attempt the ordinary server departure for an already connected
				// participant (for example a reconnect/breakout join), but never
				// let a blocked server request retain the local media renderer.
				if (context.getters.isInCall?.(payload.token)) {
					void Promise.resolve().then(() => original.leaveCall(context, payload)).catch(() => {})
				}
				try {
					if (!await bridge.cancelPending(await registration)) {
						throw new Error('The connecting call could not be closed')
					}
				} catch (error) {
					canceled = false
					throw error
				}
				return
			}
			// A failed join or a remote end may already have removed the attendee.
			// Only explicit close intent plus settled store AND media evidence allows
			// releasing without another leave request. Muting alone is not evidence.
			if (payload.desktopExplicitLeave
				&& context.getters.isInCall?.(payload.token) === false
				&& context.getters.isJoiningCall?.(payload.token) === false
				&& context.getters.isConnecting?.(payload.token) === false
				&& bridge.isMediaSettled?.() === true) {
				await bridge.release()
				return
			}
			let confirmed = false
			const wrappedContext = {
				...context,
				commit(type, data, ...rest) {
					context.commit(type, data, ...rest)
					if (type === 'setInCall' && data.token === payload.token
						&& data.sessionId === payload.participantIdentifier?.sessionId && data.flags === 0) {
						confirmed = true
					}
				},
			}
			const result = await original.leaveCall(wrappedContext, payload)
			if (payload.desktopExplicitLeave) {
				if (!confirmed) {
					throw new Error('The call could not be left. Please try again.')
				}
				await bridge.release()
			}
			return result
		},
	}
}
