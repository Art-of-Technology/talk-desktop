/* SPDX-License-Identifier: AGPL-3.0-or-later */

// Run with node_modules/electron/dist/electron.exe. No server or user profile is used.
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { CallWindowManager } = require('../src/talk/CallWindowManager.js')

app.setPath('userData', mkdtempSync(path.join(tmpdir(), 'talk-call-window-smoke-')))
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
	let main = new BrowserWindow({ show: false, name: 'talk-primary', windowStatePersistence: true })
	const original = main
	await original.loadURL('data:text/html,<title>Call continuity test</title>')
	const identity = await original.webContents.executeJavaScript(`
		window.callMarker = 'call-' + Math.random();
		window.callCanvas = document.createElement('canvas');
		window.callStream = callCanvas.captureStream(1);
		({ marker: callMarker, track: callStream.getVideoTracks()[0].id });
	`)
	let newMainLoaded
	const manager = new CallWindowManager({
		getMain: () => main,
		setMain: (window) => { main = window },
		createMain: () => {
			const window = new BrowserWindow({ show: false })
			newMainLoaded = window.loadURL('data:text/html,<title>Main chat</title>')
			return window
		},
		releaseTray: () => {},
		restoreTray: () => {},
		showMain: () => {},
		confirmLeave: async () => false,
	})
	assert.equal(manager.claim(original.webContents, 'test-room'), true)
	await newMainLoaded
	assert.notEqual(main.id, original.id)
	await main.loadURL('data:text/html,<title>Another chat with files</title>')
	const after = await original.webContents.executeJavaScript(`({
		marker: callMarker,
		track: callStream.getVideoTracks()[0].id,
		state: callStream.getVideoTracks()[0].readyState,
	})`)
	assert.deepEqual(after, { ...identity, state: 'live' })
	assert.equal(await manager.endCall(), false)
	assert.equal(original.isDestroyed(), false)
	// Model successful Talk leave, then acknowledge the release.
	await original.webContents.executeJavaScript('callStream.getTracks().forEach(track => track.stop())')
	assert.equal(manager.release(original.webContents), true)
	await new Promise((resolve) => setImmediate(resolve))
	assert.equal(original.isDestroyed(), true)
	assert.equal(main.isDestroyed(), false)
	console.log('PASS: call renderer and live synthetic media track survive independent main-window navigation; cancelled close preserves call; release closes only call window.')
	main.destroy()
	app.exit(0)
}).catch((error) => {
	console.error(error)
	app.exit(1)
})
