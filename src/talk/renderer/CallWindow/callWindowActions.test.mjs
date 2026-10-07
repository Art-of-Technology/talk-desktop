/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
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
		setJoining: async (generation) => generation === null ? 1 : true,
		cancelPending: async () => {
			calls.push('cancel')
			return true
		},
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
	const { actions, calls } = fixture({ joinCall: async ({ commit }, received) => {
		commit('updateParticipant', { token: received.token, updatedData: { inCall: 1 } })
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
	await new Promise(setImmediate)
	await actions.leaveCall(context(), { ...payload, desktopExplicitLeave: true })
	finish()
	await assert.rejects(joining, /canceled/)
	assert.deepEqual(calls, ['claim', 'cancel'])
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
	const { actions } = fixture({ joinCall: ({ commit }) => {
		commit('updateParticipant', { token: payload.token, updatedData: { inCall: 1 } })
		joined++
		return new Promise((resolve) => {
			finish = resolve
		})
	} })
	const first = actions.joinCall(context(), payload)
	await assert.rejects(actions.joinCall(context(), payload), /already connecting/)
	await new Promise(setImmediate)
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

// Execute the actual pinned store action, including its swallowed catch and
// optimistic signaling handlers, without importing the browser-only store.
function upstreamJoin(request, optimistic = false) {
	const require = createRequire(import.meta.url)
	const source = readFileSync(require.resolve('talk/src/store/participantsStore.js'), 'utf8')
	const start = source.indexOf('async joinCall({ commit, getters, state }')
	const end = source.indexOf('\n\tasync leaveCall(', start)
	assert.ok(start > 0 && end > start, 'Pinned upstream join action must remain identifiable')
	const listeners = new Map()
	const EventBus = {
		on: (event, handler) => listeners.set(event, handler),
		once: (event, handler) => listeners.set(event, handler),
		off: (event) => listeners.delete(event),
	}
	const action = vm.runInNewContext(`({ ${source.slice(start, end)} })`, {
		EventBus,
		getTalkConfig: () => 'external',
		SIGNALING: { MODE: { INTERNAL: 'internal' } },
		PARTICIPANT: { CALL_FLAG: { DISCONNECTED: 0 } },
		console: { error() {} },
		setTimeout: () => 1,
		clearTimeout() {},
		useCallViewStore: () => ({ handleJoinCall() {} }),
		joinCall: async () => {
			if (optimistic) {
				listeners.get('signaling-users-changed')?.([[{ nextcloudSessionId: 'session', inCall: 1 }]])
			}
			return request()
		},
	}).joinCall
	return action
}

test('actual pinned swallowed media/signaling errors cannot reach recording or dial-out', async () => {
	for (const optimistic of [false, true]) {
		for (const message of ['permission denied', 'signaling failed']) {
			const { actions, calls } = fixture({ joinCall: upstreamJoin(async () => {
				throw new Error(message)
			}, optimistic) })
			const store = context()
			store.state = { joiningCall: { room: { session: true } } }
			store.getters.conversation = () => ({ hasCall: false })
			await assert.rejects(async () => {
				await actions.joinCall(store, payload)
				calls.push('recording', 'dial-out')
			}, /could not be joined/)
			assert.deepEqual(calls, ['claim'])
		}
	}
})

test('actual pinned successful and optimistic joins retain success continuations', async () => {
	for (const optimistic of [false, true]) {
		const { actions } = fixture({ joinCall: upstreamJoin(async () => 1, optimistic) })
		const store = context()
		store.state = { joiningCall: { room: { session: true } } }
		store.getters.conversation = () => ({ hasCall: false })
		await actions.joinCall(store, payload)
	}
})

test('cancel during registration never starts upstream media', async () => {
	let register
	let joined = 0
	let canceledGeneration
	const actions = createCallWindowActions({ joinCall: async () => {
		joined++
	} }, {
		claim: async () => true,
		setJoining: () => new Promise((resolve) => { register = resolve }),
		cancelPending: async (value) => {
			canceledGeneration = value
			return true
		},
	})
	const joining = actions.joinCall(context(), payload)
	await Promise.resolve()
	const leaving = actions.leaveCall(context(), { ...payload, desktopExplicitLeave: true })
	register(42)
	await assert.rejects(joining, /canceled/)
	await leaving
	assert.equal(joined, 0)
	assert.equal(canceledGeneration, 42)
})

test('explicit cancellation of a reconnect attempts server departure without blocking disposal', async () => {
	let finish
	let departures = 0
	const { actions, calls } = fixture({
		joinCall: () => new Promise((resolve) => {
			finish = resolve
		}),
		leaveCall: async () => {
			departures++
			return new Promise(() => {})
		},
	})
	const store = context()
	store.getters.isInCall = () => true
	const joining = actions.joinCall(store, payload)
	await new Promise(setImmediate)
	await actions.leaveCall(store, { ...payload, desktopExplicitLeave: true })
	assert.equal(departures, 1)
	assert.deepEqual(calls, ['claim', 'cancel'])
	finish()
	await assert.rejects(joining, /canceled/)
})

test('late permission rejection after cancellation never resumes success-only work', async () => {
	let rejectMedia
	const { actions, calls } = fixture({ joinCall: () => new Promise((_resolve, reject) => {
		rejectMedia = reject
	}) })
	const joining = actions.joinCall(context(), payload)
	await new Promise(setImmediate)
	await actions.leaveCall(context(), { ...payload, desktopExplicitLeave: true })
	rejectMedia(new Error('permission denied'))
	await assert.rejects(joining)
	assert.deepEqual(calls, ['claim', 'cancel'])
})

test('failed disposal permits retry instead of leaving a permanently canceled renderer', async () => {
	let finish
	let attempts = 0
	const actions = createCallWindowActions({ joinCall: () => new Promise((resolve) => {
		finish = resolve
	}) }, {
		claim: async () => true,
		setJoining: async (value) => value === null ? 1 : true,
		cancelPending: async () => ++attempts > 1,
	})
	const joining = actions.joinCall(context(), payload)
	await new Promise(setImmediate)
	await assert.rejects(actions.leaveCall(context(), { ...payload, desktopExplicitLeave: true }), /could not be closed/)
	await actions.leaveCall(context(), { ...payload, desktopExplicitLeave: true })
	finish()
	await assert.rejects(joining, /canceled/)
	assert.equal(attempts, 2)
})

test('native close while ownership response is pending cannot start media afterward', async () => {
	let claim
	let joins = 0
	let canceledGeneration
	const actions = createCallWindowActions({ joinCall: async () => {
		joins++
	} }, {
		claim: () => new Promise((resolve) => { claim = resolve }),
		setJoining: async () => 9,
		cancelPending: async (generation) => {
			canceledGeneration = generation
			return true
		},
	})
	const joining = actions.joinCall(context(), payload)
	const leaving = actions.leaveCall(context(), { ...payload, desktopExplicitLeave: true })
	claim(true)
	await assert.rejects(joining, /canceled/)
	await leaving
	assert.equal(joins, 0)
	assert.equal(canceledGeneration, 9)
})

test('another participant update cannot confirm the local join', async () => {
	const { actions } = fixture({ joinCall: async ({ commit }) => {
		commit('updateParticipant', { token: payload.token, attendeeId: 2, updatedData: { inCall: 1 } })
	} })
	const store = context()
	store.getters.findParticipant = () => ({ attendeeId: 1 })
	await assert.rejects(actions.joinCall(store, payload), /could not be joined/)
})
