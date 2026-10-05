/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const patch = require('./idempotentLeave.loader.cjs')

const source = fs.readFileSync(path.resolve(__dirname, '../../../../spreed/src/utils/webrtc/index.js'), 'utf8')

test('patched actual upstream cleanup survives failed leave followed by retry', async () => {
	const patched = patch(source)
	const start = patched.indexOf('async function signalingLeaveCall(token, all = false) {')
	const end = patched.indexOf('\n}', start) + 2
	const body = patched.slice(start, end)
	let attempts = 0
	let destroyed = 0
	const helper = { destroy: () => destroyed++ }
	const create = new Function('helper', 'signaling', `
		let sentVideoQualityThrottler = helper, speakingStatusHandler = helper,
			callAnalyzer = helper, callParticipantsAudioPlayer = helper;
		const tokensInSignaling = {room: true};
		${body}
		return signalingLeaveCall;
	`)
	const leave = create(helper, { leaveCall: async () => {
		if (++attempts === 1) {
			throw new Error('offline')
		}
	} })
	await assert.rejects(leave('room'), /offline/)
	await leave('room')
	assert.equal(destroyed, 4)
	assert.equal(attempts, 2)
})

test('cleanup patch rejects changed upstream implementation', () => {
	assert.throws(() => patch(source.replace('callAnalyzer.destroy()', 'callAnalyzer.dispose()')), /needs review/)
})
