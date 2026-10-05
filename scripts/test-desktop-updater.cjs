/* SPDX-License-Identifier: AGPL-3.0-or-later */
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { test } = require('node:test')
const { DesktopUpdater } = require('../src/app/DesktopUpdater.js')

/**
 * Create an isolated native updater fixture.
 *
 * @param {object} options Controller overrides
 */
function setup(options = {}) {
	const native = new EventEmitter()
	const calls = []
	native.setFeedURL = (value) => calls.push(['feed', value])
	native.checkForUpdates = () => calls.push(['check'])
	native.quitAndInstall = () => calls.push(['install'])
	const states = []
	const updater = new DesktopUpdater({ autoUpdater: native, feedUrl: 'https://updates.example/windows/x64/', supported: true, onState: (state) => states.push(state), ...options })
	return { native, updater, calls, states }
}

test('missing feed is inert; no official fallback or native listeners', () => {
	const { updater, calls, native } = setup({ feedUrl: null })
	assert.equal(updater.check().status, 'disabled')
	assert.deepEqual(calls, [])
	assert.equal(native.eventNames().length, 0)
})

for (const feedUrl of ['http://updates.example/', 'https://user:secret@updates.example/', 'file:///tmp/feed', 'not a URL', 'https://updates.example/#secret']) {
	test(`reject invalid feed ${feedUrl}`, () => {
		const { updater, calls } = setup({ feedUrl })
		assert.equal(updater.check().status, 'error')
		assert.deepEqual(calls, [])
	})
}

test('unsupported installation never invokes native updater', () => {
	const { updater, calls } = setup({ supported: false })
	assert.equal(updater.check().status, 'unsupported')
	assert.equal(updater.install({ canInstall: () => true, prepareQuit: () => {} }), false)
	assert.deepEqual(calls, [])
})

test('one check/download only until ready, and late events cannot clear ready', () => {
	const { updater, calls, native } = setup()
	assert.equal(updater.check().status, 'checking')
	updater.check()
	native.emit('update-available')
	assert.equal(updater.check().status, 'downloading')
	native.emit('update-downloaded', {}, '', '2.4.0')
	assert.deepEqual(updater.check(), { status: 'ready', version: '2.4.0' })
	native.emit('update-not-available')
	native.emit('error', new Error('private details'))
	assert.equal(updater.getState().status, 'ready')
	assert.deepEqual(calls, [['feed', { url: 'https://updates.example/windows/x64/' }], ['check']])
})

test('latest result is idle and can explicitly check again', () => {
	const { updater, native, calls } = setup()
	updater.check()
	native.emit('update-not-available')
	assert.deepEqual(updater.getState(), { status: 'idle', message: 'You are up to date.' })
	updater.check()
	assert.equal(calls.filter(([name]) => name === 'check').length, 2)
})

test('native errors stay sanitized and a failed check can retry', () => {
	const { updater, native, states } = setup()
	updater.check()
	native.emit('error', new Error('secret-token'))
	assert.equal(updater.getState().status, 'error')
	assert.ok(!JSON.stringify(states).includes('secret-token'))
	assert.equal(updater.check().status, 'checking')
})

test('synchronous feed initialization errors do not escape', () => {
	const { updater, native } = setup()
	native.setFeedURL = () => {
		throw new Error('secret-token')
	}
	assert.equal(updater.check().status, 'error')
})

test('install blocked during active call; ready state is retained for later', () => {
	const { updater, native, calls } = setup()
	updater.check()
	native.emit('update-downloaded', {}, '', '2.4.0')
	assert.equal(updater.install({ canInstall: () => false, prepareQuit: () => assert.fail('must not quit') }), false)
	assert.equal(updater.getState().status, 'ready')
	assert.equal(updater.install({ canInstall: () => true, prepareQuit: () => calls.push(['prepare']) }), true)
	assert.deepEqual(calls.slice(-2), [['prepare'], ['install']])
})

test('duplicate and reentrant install requests cannot restart twice', () => {
	const { updater, native, calls } = setup()
	updater.check()
	native.emit('update-downloaded', {}, '', '2.4.0')
	const args = { canInstall: () => true, prepareQuit: () => {} }
	assert.equal(updater.install({ ...args, canInstall: () => {
		assert.equal(updater.install(args), false)
		return true
	} }), true)
	assert.equal(updater.install(args), false)
	assert.equal(calls.filter(([name]) => name === 'install').length, 1)
})

test('install before download is impossible; download itself never restarts', () => {
	const { updater, native, calls } = setup()
	assert.equal(updater.install({ canInstall: () => true, prepareQuit: () => assert.fail('must not quit') }), false)
	updater.check()
	native.emit('update-downloaded', {}, '', '2.4.0')
	assert.equal(calls.some(([name]) => name === 'install'), false)
})

test('state consumers cannot mutate controller state', () => {
	const { updater } = setup()
	updater.getState().status = 'ready'
	assert.equal(updater.getState().status, 'idle')
})

test('a failed restart preserves the downloaded update and permits a retry', () => {
	const { updater, native, calls } = setup()
	updater.check()
	native.emit('update-downloaded', {}, '', '2.4.0')
	const install = native.quitAndInstall
	native.quitAndInstall = () => {
		throw new Error('native restart failure')
	}
	const args = { canInstall: () => true, prepareQuit: () => {} }
	assert.equal(updater.install(args), false)
	assert.equal(updater.getState().status, 'ready')
	updater.check()
	assert.equal(calls.filter(([name]) => name === 'check').length, 1)
	native.quitAndInstall = install
	assert.equal(updater.install(args), true)
})

test('asynchronous restart failure releases the installation guard', () => {
	const { updater, native, states } = setup()
	updater.check()
	native.emit('update-downloaded', {}, '', '2.4.0')
	const args = { canInstall: () => true, prepareQuit: () => {} }
	assert.equal(updater.install(args), true)
	native.emit('error', new Error('private native error'))
	assert.equal(states.at(-1).status, 'error')
	assert.ok(!JSON.stringify(states).includes('private native error'))
	assert.equal(updater.check().status, 'checking')
	native.emit('update-downloaded', {}, '', '2.4.0')
	assert.equal(updater.install(args), true)
})
