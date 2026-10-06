/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const vm = require('node:vm')

test('replacement chat and external windows do not reuse a live persisted Electron name', () => {
	const names = new Set()
	const externalOptions = []
	class BrowserWindow {
		constructor(options) {
			if (options.name) {
				assert.equal(names.has(options.name), false, 'Electron rejects duplicate live names')
				names.add(options.name)
			}
			this.options = options
		}

		loadURL() {}
	}
	const sandbox = {
		module: { exports: {} },
		TALK_DESKTOP__WINDOW_TALK_PRELOAD_WEBPACK_ENTRY: 'preload',
		require(id) {
			if (id === 'electron') {
				return { BrowserWindow }
			}
			if (id.endsWith('AppConfig.ts')) {
				return { getAppConfig: () => 1 }
			}
			if (id.endsWith('build.config.ts')) {
				return { BUILD_CONFIG: {} }
			}
			if (id.endsWith('constants.js')) {
				return { TITLE_BAR_HEIGHT: 40 }
			}
			if (id.endsWith('externalLinkHandlers.ts')) {
				return { applyExternalLinkHandler: (window, options) => externalOptions.push(options) }
			}
			return new Proxy({}, { get: () => () => ({}) })
		},
	}
	vm.runInNewContext(fs.readFileSync(require.resolve('../src/talk/talk.window.js'), 'utf8'), sandbox)
	const create = sandbox.module.exports.createTalkWindow
	const initial = create()
	const chat = create({ persistWindowState: false })
	const laterChat = create({ persistWindowState: false })
	assert.equal(initial.options.name, 'talk-primary')
	assert.equal(initial.options.windowStatePersistence, true)
	for (const window of [chat, laterChat]) {
		assert.equal(window.options.name, undefined)
		assert.equal(window.options.windowStatePersistence, false)
	}
	for (const options of externalOptions) {
		assert.equal(options.name, undefined)
		assert.equal(options.windowStatePersistence, false)
	}
})
