const { parse, compileScript } = require('@vue/compiler-sfc')
/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')
const { resolveTalkPath } = require('../../../../build/resolveBuildConfig.js')
const patch = require('./callButtons.loader.cjs')

const files = {
	join: 'src/components/TopBar/CallButton.vue',
	leave: 'src/components/CallView/CallEndLeaveButton.vue',
}

/**
 * Compile a real patched callback with explicit runtime dependencies.
 *
 * @param {string} kind Component key
 * @param {string} name Callback name
 * @param {object} dependencies Callback dependencies
 */
function callback(kind, name, dependencies) {
	const resourcePath = path.join(resolveTalkPath(), files[kind])
	const source = patch.call({ resourcePath }, fs.readFileSync(resourcePath, 'utf8'))
	const { descriptor } = parse(source, { filename: resourcePath })
	const compiled = compileScript(descriptor, { id: 'desktop-call-test' })
	assert.equal(compiled.bindings[name], 'setup-const')
	const start = source.indexOf(`function ${name}(`)
	const end = source.indexOf('\n}', start) + 2
	const body = (source.slice(start - 6, start) === 'async ' ? 'async ' : '') + source.slice(start, end)
	const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
	return new Function(...Object.keys(dependencies), `${js}; return ${name}`)(...Object.values(dependencies))
}

test('real script-setup join preserves silent, consent and recording options and recovers from rejected ownership', async () => {
	const loading = { value: false }
	const hasCall = { value: false }
	const payloads = []
	let rejected = false
	const join = callback('join', 'handleJoinCall', {
		loading,
		hasCall,
		token: { value: 'room' },
		props: { silentCall: false, recordingConsentGiven: true, isRecordingFromStart: true },
		joinCall: async (token, options) => {
			assert.equal(loading.value, true)
			payloads.push({ token, ...options })
			if (rejected) {
				throw new Error('owned by another renderer')
			}
		},
		console: { debug() {} },
	})
	await join(true)
	assert.deepEqual(payloads[0], { token: 'room', silent: true, recordingConsent: true, shouldStartRecording: true })
	await join(false)
	assert.equal(payloads[1].silent, false)
	hasCall.value = true
	await join(false)
	assert.equal(payloads[2].silent, true)
	rejected = true
	await join()
	assert.equal(loading.value, false)
})

/**
 * Dependencies for a real leave callback, including the untouched upstream branch.
 *
 * @param {object} options Fixture options
 */
function leaveFixture({ owner = true, voice = false, fail = false } = {}) {
	const dispatched = []
	const routed = []
	const errors = []
	const loading = { value: false }
	const leave = callback('leave', 'leaveCall', {
		loading,
		callWindowState: { isCallWindow: owner },
		token: { value: 'room' },
		actorStore: { participantIdentifier: { sessionId: 'session' } },
		vuexStore: { dispatch: async (...args) => {
			assert.equal(loading.value, true)
			dispatched.push(args)
			if (fail) {
				throw new Error('offline')
			}
		} },
		showError: (message) => errors.push(message),
		t: (app, message) => message,
		console: { info() {}, error() {} },
		isVoiceRoom: { value: voice },
		router: { push: (route) => routed.push(route) },
		callViewStore: { setSelectedVideoPeerId() {} },
		isMobile: { value: false },
		emit() {},
	})
	return { leave, dispatched, routed, errors, loading }
}

test('explicit owner leave/end marks intent, including voice rooms, without racing route cleanup', async () => {
	for (const voice of [false, true]) {
		const fixture = leaveFixture({ voice })
		await fixture.leave(true)
		assert.deepEqual(fixture.dispatched, [['leaveCall', {
			token: 'room',
			participantIdentifier: { sessionId: 'session' },
			all: true,
			desktopExplicitLeave: true,
		}]])
		assert.equal(fixture.routed.length, 0)
		assert.equal(fixture.loading.value, false)
	}
})

test('failed owner leave remains retryable and reports the failure', async () => {
	const fixture = leaveFixture({ fail: true })
	await fixture.leave()
	assert.equal(fixture.loading.value, false)
	assert.equal(fixture.errors.length, 1)
	assert.equal(fixture.routed.length, 0)
})

test('non-owner leave retains upstream payload and voice-room navigation', async () => {
	const fixture = leaveFixture({ owner: false })
	await fixture.leave()
	assert.equal(fixture.dispatched[0][1].desktopExplicitLeave, undefined)
	const voice = leaveFixture({ owner: false, voice: true })
	await voice.leave()
	assert.deepEqual(voice.routed, [{ name: 'root' }])
	assert.equal(voice.dispatched.length, 0)
})

test('breakout switch keeps the existing renderer rather than invoking explicit leave', () => {
	const events = []
	const switchRoom = callback('leave', 'switchToParentRoom', {
		EventBus: { emit: (...args) => events.push(args) },
		token: { value: 'breakout' },
		breakoutRoomsStore: { getParentRoomToken: () => 'parent' },
	})
	switchRoom()
	assert.deepEqual(events, [['switch-to-conversation', { token: 'parent' }]])
})

test('upstream callback drift fails the build rather than dropping protection', () => {
	for (const [kind, file] of Object.entries(files)) {
		const resourcePath = path.join(resolveTalkPath(), file)
		const source = fs.readFileSync(resourcePath, 'utf8')
		const changed = source.replace(kind === 'join' ? 'handleJoinCall(silent?: boolean)' : 'leaveCall(endMeetingForAll = false)', 'changedCallback()')
		assert.throws(() => patch.call({ resourcePath }, changed), /needs review/)
		assert.throws(() => patch.call({ resourcePath }, source.replace('const token = useGetToken()', 'const token = differentToken()')), /needs review/)
	}
})
