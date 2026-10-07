/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

const compiled = ts.transpileModule(fs.readFileSync(require.resolve('../src/app/downloads.ts'), 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText

for (const state of ['completed', 'interrupted', 'cancelled']) {
	test(`replacement windows register one download handler (${state})`, () => {
		const shown = []
		const opened = []
		class Notification extends EventEmitter {
			constructor(options) {
				super()
				this.options = options
			}

			show() { shown.push(this) }
		}
		const exports = {}
		vm.runInNewContext(compiled, {
			exports,
			require(id) {
				if (id === 'electron') {
					return { Notification, shell: { showItemInFolder: (file) => opened.push(file) } }
				}
				return require(id)
			},
		})
		const session = new EventEmitter()
		for (let i = 0; i < 8; i++) {
			const window = new EventEmitter()
			window.webContents = { session }
			exports.applyDownloadHandler(window)
			window.emit('closed')
		}
		assert.equal(session.listenerCount('will-download'), 1)
		const otherSession = new EventEmitter()
		exports.applyDownloadHandler({ webContents: { session: otherSession } })
		assert.equal(otherSession.listenerCount('will-download'), 1)
		const item = new EventEmitter()
		item.getURL = () => 'https://files.example/file'
		item.getSavePath = () => '/tmp/report.pdf'
		const suggested = []
		item.setSaveDialogOptions = (options) => suggested.push(options.defaultPath)
		exports.pushDownloadUrlFilenameSuggestion(item.getURL(), 'report.pdf')
		session.emit('will-download', {}, item)
		assert.equal(item.listenerCount('done'), 1)
		assert.deepEqual(suggested, ['report.pdf'])
		item.emit('done', {}, state)
		assert.equal(shown.length, state === 'cancelled' ? 0 : 1)
		if (state === 'completed') {
			shown[0].emit('click')
			assert.deepEqual(opened, ['/tmp/report.pdf'])
		}
		shown[0]?.emit('close')
		assert.equal(session.listenerCount('will-download'), 1)
	})
}
