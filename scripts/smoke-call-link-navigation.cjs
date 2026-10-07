/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const { app, BrowserWindow } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'talk-link-smoke-')))
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
	const exports = {}
	const code = ts.transpileModule(fs.readFileSync(require.resolve('../src/app/externalLinkHandlers.ts'), 'utf8'), {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
	}).outputText
	vm.runInNewContext(code, { exports, URL, process, require(id) {
		if (id === 'electron') {
			return { shell: { openExternal() {
				throw new Error('Unexpected browser navigation')
			} } }
		}
		if (id === './AppData.js') {
			return { appData: { serverUrl: 'https://chat.example' } }
		}
		if (id === './utils.ts') {
			return { isExternalUrl: () => true }
		}
		throw new Error(`Unexpected dependency ${id}`)
	} })
	const owner = new BrowserWindow({ show: false })
	await owner.loadURL('data:text/html,<title>Retained call</title>')
	await owner.webContents.executeJavaScript(`
		window.track = document.createElement('canvas').captureStream().getVideoTracks()[0];
		window.marker = 'original renderer';
	`)
	let chat = new BrowserWindow({ show: false })
	chat.destroy()
	let routed
	const routeReady = new Promise((resolve) => {
		routed = resolve
	})
	exports.setInternalNavigationTarget(owner, () => {
		if (chat.isDestroyed()) {
			chat = new BrowserWindow({ show: false })
			chat.webContents.on('did-navigate-in-page', (_event, url) => {
				if (url.includes('/call/target')) {
					routed()
				}
			})
			const fixture = path.join(app.getPath('userData'), 'chat.html')
			fs.writeFileSync(fixture, '<title>Restored chat</title>')
			void chat.loadFile(fixture)
		}
		return chat
	})
	exports.applyExternalLinkHandler(owner)
	await owner.webContents.executeJavaScript('window.location.href = \'https://chat.example/call/target?view=chat#message9\'')
	let timer
	await Promise.race([routeReady, new Promise((resolve, reject) => {
		timer = setTimeout(() => reject(new Error('Chat route did not arrive: ' + (chat.isDestroyed() ? 'destroyed' : chat.webContents.getURL()))), 5000)
	})])
	clearTimeout(timer)
	assert.equal(await chat.webContents.executeJavaScript('window.location.hash'), '#/call/target?view=chat#message9')
	assert.equal(await owner.webContents.executeJavaScript('window.marker'), 'original renderer')
	assert.equal(await owner.webContents.executeJavaScript('window.track.readyState'), 'live')
	owner.destroy()
	chat.destroy()
	console.log('PASS: Talk link restores chat and preserves route details without reloading the call or stopping synthetic media.')
	app.exit(0)
}).catch((error) => {
	console.error(error)
	app.exit(1)
})
