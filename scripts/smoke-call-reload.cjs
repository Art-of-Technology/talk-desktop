/* SPDX-License-Identifier: AGPL-3.0-or-later */

// Electron-only document lifecycle check. No server, real media or user profile.
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { CallWindowManager } = require('../src/talk/CallWindowManager.js')

app.setPath('userData', mkdtempSync(path.join(tmpdir(), 'talk-reload-smoke-')))
app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
	for (const pending of [false, true]) {
		let main = new BrowserWindow({ show: false })
		const owner = main
		let chatLoaded
		const manager = new CallWindowManager({
			getMain: () => main,
			setMain: (window) => { main = window },
			createMain: () => {
				const window = new BrowserWindow({ show: false })
				chatLoaded = window.loadURL('data:text/html,<title>Replacement chat</title>')
				return window
			},
			releaseTray() {},
			restoreTray() {},
			showMain() {},
			confirmLeave: async () => true,
		})
		await owner.loadURL('data:text/html,<title>Call owner</title>')
		manager.claim(owner.webContents, 'synthetic-room')
		await chatLoaded
		const generation = manager.setJoining(owner.webContents, null)
		if (!pending) {
			manager.setJoining(owner.webContents, generation)
			await owner.webContents.executeJavaScript(`
				window.syntheticStream = document.createElement('canvas').captureStream(1);
			`)
		}
		await owner.webContents.executeJavaScript(`
			window.location.hash = '#another-route';
			new Promise((resolve) => {
				const frame = document.createElement('iframe');
				frame.onload = resolve;
				frame.src = 'data:text/html,Subframe';
				document.body.appendChild(frame);
			});
		`)
		assert.equal(owner.isDestroyed(), false)
		assert.equal(manager.owner, owner)
		assert.equal(manager.pendingJoin, pending ? generation : null)
		if (!pending) {
			assert.equal(await owner.webContents.executeJavaScript('syntheticStream.getVideoTracks()[0].readyState'), 'live')
		}
		// Intercepted external links start navigation but never commit it.
		const intercepted = new Promise((resolve) => owner.webContents.once('will-navigate', (event) => {
			event.preventDefault()
			resolve()
		}))
		await owner.webContents.executeJavaScript("window.location.href = 'https://example.invalid/intercepted'; undefined")
		await intercepted
		assert.equal(owner.isDestroyed(), false)
		assert.equal(manager.owner, owner)
		const closing = manager.endCall()
		await new Promise(setImmediate)
		const disposed = new Promise((resolve) => owner.once('closed', resolve))
		owner.webContents.reload()
		await disposed
		assert.equal(await closing, true)
		assert.equal(manager.pendingJoin, null)
		assert.equal(manager.pendingLeave, null)
		assert.equal(main.isDestroyed(), false)
		assert.equal(await main.webContents.executeJavaScript('document.title'), 'Replacement chat')
		const replacement = main
		manager.claim(replacement.webContents, 'next-room')
		await chatLoaded
		const nextGeneration = manager.setJoining(replacement.webContents, null)
		assert.ok(nextGeneration > generation)
		assert.equal(manager.cancelPending(replacement.webContents, generation), false)
		assert.equal(manager.pendingJoin, nextGeneration)
		replacement.destroy()
		main.destroy()
	}
	console.log('PASS: pending and active full-document reloads dispose the old call owner; chat and new joins survive; hash/subframe navigation preserves synthetic media; stale generations cannot cancel the new owner.')
	app.exit(0)
}).catch((error) => {
	console.error(error)
	app.exit(1)
})
