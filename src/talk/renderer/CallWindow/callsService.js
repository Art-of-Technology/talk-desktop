/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { signalingLeaveCall } from '@talk/src/utils/webrtc/index.js'

export * from '@talk/src/services/callsService.ts'

/**
 * Do not report a successful leave when signaling rejected it. The upstream
 * service swallows this error, which would let us close a still-active call.
 *
 * @param {string} token Conversation token
 * @param {boolean} all End the meeting for everyone
 */
export async function leaveCall(token, all = false) {
	await signalingLeaveCall(token, all)
}
