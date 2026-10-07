const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
/* SPDX-License-Identifier: AGPL-3.0-or-later */
const { test } = require('node:test')
const vm = require('node:vm')
const { CallWindowManager } = require('../src/talk/CallWindowManager.js')

class Window extends EventEmitter {
	constructor() {
		super()
		this.messages = []
		this.webContents = new EventEmitter()
		this.webContents.send = (...args) => this.messages.push(args)
		this.destroyed = false
		this.focused = false
	}

	isDestroyed() { return this.destroyed }
	show() {}
	focus() { this.focused = true }
	destroy() {
		this.destroyed = true
		this.emit('closed')
	}
}
/**
 * Construct isolated window ownership fixtures.
 *
 * @param {object} options Dependency overrides
 */
function setup(options = {}) {
	const original = new Window()
	let main = original
	let releasedTray = null
	const manager = new CallWindowManager({
		getMain: () => main,
		setMain: (value) => { main = value },
		createMain: () => new Window(),
		releaseTray: (window) => { releasedTray = window },
		restoreTray: () => {},
		showMain: () => {},
		confirmLeave: async () => true,
		leaveTimeout: 1000,
		...options,
	})
	return { manager, original, getMain: () => main, releasedTray: () => releasedTray }
}
test('promotion preserves renderer and publishes ownership before returning', () => {
	const { manager, original, getMain, releasedTray } = setup()
	assert.equal(manager.claim(original.webContents, 'room123'), true)
	assert.notEqual(getMain(), original)
	assert.equal(releasedTray(), original)
	assert.equal(original.isDestroyed(), false)
	assert.equal(original.focused, true)
	assert.deepEqual(original.messages.at(-1), ['call:state-changed', { isCallWindow: true, hasCallWindow: true }])
	assert.equal(manager.claim(getMain().webContents, 'otherroom'), false)
	assert.equal(original.focused, true)
	assert.equal(manager.claim(original.webContents, 'breakout'), true)
})
test('unknown senders cannot claim or release and main cannot release another renderer', () => {
	const { manager, original, getMain } = setup()
	assert.equal(manager.claim({}, 'room'), false)
	assert.equal(manager.claim(original.webContents, ''), false)
	manager.claim(original.webContents, 'room')
	assert.equal(manager.release(getMain().webContents), false)
	assert.equal(manager.release({}), false)
	assert.equal(manager.owner, original)
})
test('close waits for leave confirmation and coalesces concurrent lifecycle requests', async () => {
	let confirmations = 0
	const { manager, original } = setup({ confirmLeave: async () => {
		confirmations++
		return true
	} })
	manager.claim(original.webContents, 'room')
	const first = manager.endCall()
	assert.equal(manager.endCall(), first)
	await new Promise(setImmediate)
	assert.equal(confirmations, 1)
	assert.deepEqual(original.messages.at(-1), ['call:leave-requested'])
	assert.equal(original.isDestroyed(), false)
	manager.release(original.webContents)
	assert.equal(await first, true)
	await new Promise(setImmediate)
	assert.equal(original.isDestroyed(), true)
})
test('declined confirmation and unresponsive renderer never destroy a live call', async () => {
	for (const accepted of [false, true]) {
		const { manager, original } = setup({ confirmLeave: async () => accepted, leaveTimeout: 10 })
		manager.claim(original.webContents, 'room')
		assert.equal(await manager.endCall(), false)
		assert.equal(manager.owner, original)
		assert.equal(original.isDestroyed(), false)
	}
})
test('failed main creation restores tray and relinquishes reservation', () => {
	let restored = null
	const { manager, original } = setup({ createMain: () => {
		throw new Error('cannot create')
	}, restoreTray: (window) => { restored = window } })
	assert.throws(() => manager.claim(original.webContents, 'room'))
	assert.equal(manager.owner, null)
	assert.equal(restored, original)
})
test('late close event from old owner cannot clear a newly claimed call', async () => {
	const { manager, original, getMain } = setup()
	manager.claim(original.webContents, 'room')
	manager.release(original.webContents)
	const next = getMain()
	manager.claim(next.webContents, 'next')
	await new Promise(setImmediate)
	assert.equal(manager.owner, next)
})

test('tray transfer detaches old close interception and preserves only new owner tray', () => {
	const trays = []
	class Tray extends EventEmitter {
		constructor() {
			super()
			this.destroyed = false
			trays.push(this)
		}

		setToolTip() {}
		setContextMenu() {}
		destroy() { this.destroyed = true }
	}
	const app = new EventEmitter()
	const context = {
		module: { exports: {} },
		__dirname,
		require: (name) => {
			if (name === 'electron') {
				return { app, Tray, Menu: { buildFromTemplate: (items) => items } }
			}
			if (name === 'node:path') {
				return path
			}
			return { getTrayIcon: () => 'icon.png' }
		},
	}
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/app/app.tray.js'), 'utf8'), context)
	const { setupTray, releaseTray, cancelTrayQuit } = context.module.exports
	const old = new Window()
	let hidden = false
	old.hide = () => {
		hidden = true
	}
	setupTray(old)
	assert.equal(old.listenerCount('close'), 1)
	releaseTray(old)
	assert.equal(old.listenerCount('close'), 0)
	assert.equal(trays[0].destroyed, true)
	const next = new Window()
	next.hide = () => {
		hidden = true
	}
	setupTray(next)
	let prevented = false
	app.emit('before-quit')
	cancelTrayQuit()
	next.emit('close', { preventDefault: () => {
		prevented = true
	} })
	assert.equal(prevented, true)
	assert.equal(hidden, true)
	assert.equal(trays[1].destroyed, false)
	next.destroy()
	assert.equal(trays[1].destroyed, true)
})

test('timeout close requires explicit opt-in and shares one pending confirmation', async () => {
	let answer
	let reached
	const waiting = new Promise((resolve) => {
		reached = resolve
	})
	const { manager, original } = setup({ leaveTimeout: 1, onLeaveTimeout: () => {
		reached()
		return new Promise((resolve) => {
			answer = resolve
		})
	} })
	manager.claim(original.webContents, 'room')
	const pending = manager.endCall()
	await waiting
	assert.equal(manager.endCall(), pending)
	assert.equal(original.isDestroyed(), false)
	answer(true)
	assert.equal(await pending, true)
	assert.equal(original.isDestroyed(), true)
	assert.equal(manager.owner, null)
})

test('late timeout confirmation and renderer crash cannot release a new owner', async () => {
	let answer
	let reached
	const waiting = new Promise((resolve) => {
		reached = resolve
	})
	const { manager, original, getMain } = setup({ leaveTimeout: 1, onLeaveTimeout: () => {
		reached()
		return new Promise((resolve) => {
			answer = resolve
		})
	} })
	manager.claim(original.webContents, 'room')
	const pending = manager.endCall()
	await waiting
	manager.release(original.webContents)
	assert.equal(await pending, true)
	const next = getMain()
	manager.claim(next.webContents, 'next')
	answer(true)
	original.webContents.emit('render-process-gone')
	await new Promise(setImmediate)
	assert.equal(manager.owner, next)
	assert.equal(next.isDestroyed(), false)
	next.webContents.emit('render-process-gone')
	assert.equal(manager.owner, null)
	await new Promise(setImmediate)
	assert.equal(next.isDestroyed(), true)
})

test('pending cancellation destroys only the owned generation and preserves replacement chat', async () => {
	for (const nativeClose of [false, true]) {
		let timeouts = 0
		const { manager, original, getMain } = setup({ leaveTimeout: 1, onLeaveTimeout: () => {
			timeouts++
			return false
		} })
		manager.claim(original.webContents, 'room')
		const generation = manager.setJoining(original.webContents, null)
		assert.equal(manager.cancelPending(getMain().webContents, generation), false)
		assert.equal(manager.cancelPending(original.webContents, generation + 1), false)
		if (nativeClose) {
			original.emit('close', { preventDefault() {} })
		}
		const quitting = manager.endCall()
		await new Promise(setImmediate)
		assert.equal(manager.cancelPending(original.webContents, generation), true)
		assert.equal(original.isDestroyed(), true, 'dispose synchronously, before late renderer callbacks')
		assert.equal(getMain().isDestroyed(), false)
		assert.equal(await quitting, true)
		assert.equal(manager.owner, null)
		await new Promise((resolve) => setTimeout(resolve, 5))
		assert.equal(timeouts, 0)
		manager.claim(getMain().webContents, 'next-room')
		assert.equal(manager.cancelPending(original.webContents, generation), false)
	}
})

test('active calls cannot use pending cancellation and local leave failure clears server timer', async () => {
	let timeouts = 0
	const { manager, original, getMain } = setup({ leaveTimeout: 1, onLeaveTimeout: () => {
		timeouts++
		return false
	} })
	manager.claim(original.webContents, 'room')
	const generation = manager.setJoining(original.webContents, null)
	assert.equal(manager.setJoining(original.webContents, generation), true)
	assert.equal(manager.cancelPending(original.webContents, generation), false)
	const leaving = manager.endCall()
	await new Promise(setImmediate)
	assert.equal(manager.leaveFailed(getMain().webContents), false)
	assert.equal(manager.leaveFailed(original.webContents), true)
	assert.equal(await leaving, false)
	await new Promise((resolve) => setTimeout(resolve, 5))
	assert.equal(timeouts, 0)
	assert.equal(original.isDestroyed(), false)
})
