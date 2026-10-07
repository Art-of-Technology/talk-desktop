/* SPDX-License-Identifier: AGPL-3.0-or-later */

// Electron-only synthetic permission race. Does not use real media or a user profile.
const { app, BrowserWindow, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, readFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const { CallWindowManager } = require('../src/talk/CallWindowManager.js')

app.setPath('userData', mkdtempSync(path.join(tmpdir(), 'talk-cancel-smoke-')))
app.on('window-all-closed', () => {})
const actionsSource = readFileSync(path.join(__dirname, '../src/talk/renderer/CallWindow/callWindowActions.js'), 'utf8').replace('export function', 'function')

app.whenReady().then(async () => {
	for (const denied of [false, true]) {
		let main = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } })
		const owner = main
		let loaded
		let timeoutCount = 0
		const effects = []
		const manager = new CallWindowManager({
			getMain: () => main,
			setMain: (window) => { main = window },
			createMain: () => {
				const window = new BrowserWindow({ show: false })
				loaded = window.loadURL('data:text/html,<title>Chat preserved</title>')
				return window
			},
			releaseTray() {},
			restoreTray() {},
			showMain() {},
			confirmLeave: async () => true,
			leaveTimeout: 50,
			onLeaveTimeout: () => { timeoutCount++ },
		})
		ipcMain.handle('smoke:claim', (event, token) => manager.claim(event.sender, token))
		ipcMain.handle('smoke:joining', (event, generation) => manager.setJoining(event.sender, generation))
		ipcMain.handle('smoke:cancel', (event, generation) => manager.cancelPending(event.sender, generation))
		const effect = (_event, name) => effects.push(name)
		ipcMain.on('smoke:effect', effect)
		const ready = new Promise((resolve) => ipcMain.once('smoke:ready', resolve))
		await owner.loadURL('data:text/html,<title>Pending synthetic permission</title>')
		await owner.webContents.executeJavaScript(`
			${actionsSource}
			const { ipcRenderer } = require('electron');
			const payload = { token: 'synthetic-room', participantIdentifier: { sessionId: 'synthetic' } };
			const context = { getters: { findParticipant: () => ({ attendeeId: 1 }) }, commit() {} };
			const actions = createCallWindowActions({
				joinCall: async ({ commit }) => {
					await new Promise((resolve, reject) => {
						setTimeout(() => ${denied ? "reject(new Error('Synthetic permission denied'))" : 'resolve()'}, 200);
						ipcRenderer.send('smoke:ready');
					});
					ipcRenderer.send('smoke:effect', 'signaling');
					commit('updateParticipant', { token: payload.token, attendeeId: 1, updatedData: { inCall: 1 } });
				},
			}, {
				claim: (token) => ipcRenderer.invoke('smoke:claim', token),
				setJoining: (generation) => ipcRenderer.invoke('smoke:joining', generation),
				cancelPending: (generation) => ipcRenderer.invoke('smoke:cancel', generation),
			});
			ipcRenderer.on('call:leave-requested', () => {
				void actions.leaveCall(context, { ...payload, desktopExplicitLeave: true });
			});
			void actions.joinCall(context, payload).then(() => {
				ipcRenderer.send('smoke:effect', 'recording/dial-out');
			}).catch(() => {});
			undefined;
		`)
		await ready
		await loaded
		// Both native close and app quit use endCall; exercise both entry points.
		if (denied) {
			owner.close()
		}
		assert.equal(await manager.endCall(), true)
		assert.equal(owner.isDestroyed(), true)
		await new Promise((resolve) => setTimeout(resolve, 300))
		assert.deepEqual(effects, [])
		assert.equal(timeoutCount, 0)
		assert.equal(await main.webContents.executeJavaScript('document.title'), 'Chat preserved')
		ipcMain.removeHandler('smoke:claim')
		ipcMain.removeHandler('smoke:joining')
		ipcMain.removeHandler('smoke:cancel')
		ipcMain.removeListener('smoke:effect', effect)
		main.destroy()
	}
	console.log('PASS: cancel before synthetic permission resolve/reject destroys call renderer, suppresses signaling and success effects, retains chat, and avoids leave timeout.')
	app.exit(0)
}).catch((error) => {
	console.error(error)
	app.exit(1)
})
