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
	return {
		...original,
		async joinCall(context, payload) {
			if (!payload.participantIdentifier?.sessionId
				|| !context.getters.findParticipant(payload.token, payload.participantIdentifier)) {
				throw new Error('Cannot join a call without an active conversation session')
			}
			if (!await bridge.claim(payload.token)) {
				bridge.denied()
				// Reject, rather than resolving, so recording/dial-out continuations
				// in useJoinCall cannot execute in the chat window.
				throw new Error('A call is already open in another window')
			}
			if (joinsPending) {
				throw new Error('A call is already connecting in this window')
			}
			joinsPending++
			try {
				return await original.joinCall(context, payload)
			} finally {
				joinsPending--
			}
		},
		async leaveCall(context, payload) {
			if (payload.desktopExplicitLeave && joinsPending) {
				throw new Error('The call is still connecting. Please try leaving again.')
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
