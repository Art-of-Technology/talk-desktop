/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCallWindowActions } from './callWindowActions.js'

const payload = { token: 'room', participantIdentifier: { sessionId: 'session' } }
const context = () => ({ getters: { findParticipant: () => ({}) }, commit() {} })

function fixture(original, allowed = true) {
	const calls = []
	const actions = createCallWindowActions(original, {
		claim: async () => {
			calls.push('claim')
			return allowed
		},
		denied: () => calls.push('denied'),
		release: async () => { calls.push('release') },
	})
	return { actions, calls }
}

test('denied ownership stops joining and caller recording/dial-out continuations', async () => {
	const { actions, calls } = fixture({ joinCall: async () => calls.push('joined') }, false)
	await assert.rejects(async () => {
		await actions.joinCall(context(), payload)
		calls.push('start-recording')
	}, /already open/)
	assert.deepEqual(calls, ['claim', 'denied'])
})

test('claim occurs before the original join and forwards its session and media options', async () => {
	const input = { ...payload, options: { videoOn: false }, flags: 3 }
	const { actions, calls } = fixture({ joinCall: async (_context, received) => {
		assert.equal(received, input)
		calls.push('joined')
		return 'result'
	} })
	assert.equal(await actions.joinCall(context(), input), 'result')
	assert.deepEqual(calls, ['claim', 'joined'])
})

test('a confirmed explicit leave releases, a breakout/reconnect leave does not', async () => {
	const original = { leaveCall: async ({ commit }, data) => {
		commit('setInCall', { token: data.token, sessionId: data.participantIdentifier.sessionId, flags: 0 })
	} }
	const { actions, calls } = fixture(original)
	await actions.leaveCall(context(), payload)
	assert.deepEqual(calls, [])
	await actions.leaveCall(context(), { ...payload, desktopExplicitLeave: true })
	assert.deepEqual(calls, ['release'])
})

test('failed or no-op leave retains ownership', async () => {
	const failedLeave = async () => {
		throw new Error('offline')
	}
	for (const leaveCall of [failedLeave, async () => {}]) {
		const { actions, calls } = fixture({ leaveCall })
		await assert.rejects(actions.leaveCall(context(), { ...payload, desktopExplicitLeave: true }))
		assert.deepEqual(calls, [])
	}
})

test('close during pending join cannot race media startup', async () => {
	let finish
	const { actions, calls } = fixture({ joinCall: () => new Promise((resolve) => {
		finish = resolve
	}) })
	const joining = actions.joinCall(context(), payload)
	await Promise.resolve()
	await assert.rejects(actions.leaveCall(context(), { ...payload, desktopExplicitLeave: true }), /connecting/)
	finish()
	await joining
	assert.deepEqual(calls, ['claim'])
})

test('uncertain join failure never closes a potentially active media renderer', async () => {
	const { actions, calls } = fixture({ joinCall: async () => {
		throw new Error('network timeout')
	} })
	await assert.rejects(actions.joinCall(context(), payload), /network timeout/)
	assert.deepEqual(calls, ['claim'])
})

test('concurrent joins in the same renderer start only one media session', async () => {
	let finish
	let joined = 0
	const { actions } = fixture({ joinCall: () => {
		joined++
		return new Promise((resolve) => {
			finish = resolve
		})
	} })
	const first = actions.joinCall(context(), payload)
	await assert.rejects(actions.joinCall(context(), payload), /already connecting/)
	assert.equal(joined, 1)
	finish()
	await first
})

test('explicit close of an ended call requires both settled state and media', async () => {
	for (const settled of [false, true]) {
		let released = false
		const actions = createCallWindowActions({ leaveCall: async () => {} }, {
			isMediaSettled: () => settled,
			release: async () => { released = true },
		})
		const ended = context()
		ended.getters.isInCall = () => false
		ended.getters.isJoiningCall = () => false
		ended.getters.isConnecting = () => false
		ended.getters.findParticipant = () => undefined
		const leaving = actions.leaveCall(ended, { ...payload, desktopExplicitLeave: true })
		if (settled) {
			await leaving
		} else {
			await assert.rejects(leaving)
		}
		assert.equal(released, settled)
	}
})

test('invalid conversation session cannot claim a call window', async () => {
	const { actions, calls } = fixture({})
	await assert.rejects(actions.joinCall(context(), { token: 'room' }), /active conversation session/)
	assert.deepEqual(calls, [])
})
