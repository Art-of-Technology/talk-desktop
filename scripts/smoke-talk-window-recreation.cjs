/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Run with Electron. Uses isolated userData and synthetic canvas media only.
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { CallWindowManager } = require('../src/talk/CallWindowManager.js')
const { loadTalkWindowFactory } = require('./fixtures/talk-window-factory.cjs')

app.setPath('userData', mkdtempSync(path.join(tmpdir(), 'talk-recreation-smoke-')))
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
	const create = loadTalkWindowFactory(BrowserWindow)
	let main = create()
	const owner = main
	await owner.webContents.executeJavaScript(`
		window.auditCanvas = document.createElement('canvas');
		window.auditStream = auditCanvas.captureStream(1);
	`)
	const manager = new CallWindowManager({
		getMain: () => main,
		setMain: (window) => { main = window },
		createMain: () => create({ persistWindowState: false }),
		releaseTray: () => {},
		restoreTray: () => {},
		showMain: () => {
			if (main.isDestroyed()) {
				main = create()
			}
		},
		confirmLeave: async () => false,
	})
	assert.equal(manager.claim(owner.webContents, 'audit-room'), true)
	main.destroy()
	main = create()
	assert.equal(owner.isDestroyed(), false)
	assert.equal(await owner.webContents.executeJavaScript('auditStream.getVideoTracks()[0].readyState'), 'live')
	main.destroy()
	// release recreates chat synchronously; original named owner is destroyed later.
	assert.equal(manager.release(owner.webContents), true)
	assert.equal(main.isDestroyed(), false)
	await new Promise((resolve) => setImmediate(resolve))
	assert.equal(owner.isDestroyed(), true)
	main.destroy()
	const final = create()
	assert.equal(final.isDestroyed(), false)
	final.destroy()
	console.log('PASS: real factory recreates chat while named call owner is live, during deferred release, and after owner destruction; synthetic track stays live until release.')
	app.exit(0)
}).catch((error) => {
	console.error(error)
	app.exit(1)
})
