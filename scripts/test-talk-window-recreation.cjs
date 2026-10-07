/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const { loadTalkWindowFactory } = require('./fixtures/talk-window-factory.cjs')

class Window {
	constructor(options) { this.options = options }
	isDestroyed() { return !!this.destroyed }
	destroy() { this.destroyed = true }
	loadURL() {}
	show() { this.shown = true }
	isMinimized() { return !!this.minimized }
	restore() { this.minimized = false }
}

test('recreated chat cannot reserve the live promoted window primary name', () => {
	const create = loadTalkWindowFactory(Window)
	const original = create()
	assert.equal(original.options.name, 'talk-primary')
	const replacement = create({ persistWindowState: false })
	replacement.destroy()
	const recreated = create()
	assert.equal(recreated.options.name, undefined)
	assert.equal(recreated.options.windowStatePersistence, false)
	assert.equal(original.isDestroyed(), false)
	// Clearing call ownership before deferred destruction must not release the name.
	const beforeDestruction = create()
	assert.equal(beforeDestruction.options.name, undefined)
	original.destroy()
	const afterDestruction = create()
	assert.equal(afterDestruction.options.name, 'talk-primary')
	assert.equal(afterDestruction.options.windowStatePersistence, true)
})

test('macOS dock activation restores minimized chat and respects shutdown guard', () => {
	const source = fs.readFileSync(path.join(__dirname, '../src/bootstrap.js'), 'utf8')
	const start = source.indexOf('\tfunction focusMainWindow()')
	assert.notEqual(start, -1, 'Main-window focus callback must exist')
	const end = source.indexOf('\n\t}', start) + 3
	assert.ok(end > start, 'Main-window focus callback must have a closing brace')
	const registration = source.match(/app\.on\('activate', focusMainWindow\)/)
	assert.ok(registration, 'Dock activation must use the shared focus callback')
	let activate
	const window = new Window({})
	window.minimized = true
	const context = vm.createContext({
		mainWindow: window,
		mandatoryClosing: false,
		createMainWindow: loadTalkWindowFactory(Window),
		onReadyToShow: (_, callback) => callback(),
		app: { on: (_, callback) => { activate = callback } },
	})
	vm.runInContext(source.slice(start, end) + '\n' + registration[0], context)
	activate()
	assert.equal(window.minimized, false)
	assert.equal(window.shown, true)
	window.destroy()
	activate()
	assert.equal(context.mainWindow.isDestroyed(), false)
	assert.equal(context.mainWindow.shown, true)
	context.mainWindow.destroy()
	context.mandatoryClosing = true
	activate()
	assert.equal(context.mainWindow.isDestroyed(), true)
})
