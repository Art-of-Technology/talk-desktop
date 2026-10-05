/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Make upstream call cleanup retryable, failing the build on upstream drift.
 *
 * @param {string} source Original pinned upstream module
 */
module.exports = function idempotentLeave(source) {
	const start = source.indexOf('async function signalingLeaveCall(token, all = false) {')
	const end = source.indexOf('\n}', start)
	if (start < 0 || end < 0) {
		throw new Error('Call cleanup patch needs review: upstream leave function changed')
	}
	let body = source.slice(start, end)
	for (const helper of ['sentVideoQualityThrottler', 'speakingStatusHandler', 'callAnalyzer', 'callParticipantsAudioPlayer']) {
		const needle = `${helper}.destroy()`
		if (body.split(needle).length !== 2) {
			throw new Error(`Call cleanup patch needs review: unexpected ${helper} cleanup`)
		}
		body = body.replace(needle, `${helper}?.destroy()`)
	}
	return source.slice(0, start) + body + source.slice(end)
}
