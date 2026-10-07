/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

/**
 * Run the registered production IPC callback with inert native consent APIs.
 *
 * @param {string} status Native consent state
 * @param {boolean} isMac Whether this is a macOS client
 */
function fixture(status, isMac = true) {
	const source = fs.readFileSync(path.join(__dirname, '../src/bootstrap.js'), 'utf8')
	const start = source.indexOf("ipcMain.handle('app:getDesktopCapturerSources'")
	assert.notEqual(start, -1, 'Screen-source IPC registration must exist')
	const end = source.indexOf('\n})', start) + 3
	assert.ok(end > start, 'Screen-source IPC registration must have a closing callback')
	const calls = []
	let handle
	vm.runInNewContext(source.slice(start, end), {
		isMac,
		ipcMain: { handle: (_, callback) => { handle = callback } },
		systemPreferences: { getMediaAccessStatus: (kind) => {
			calls.push(['status', kind])
			return status
		} },
		shell: { openExternal: async (url) => calls.push(['settings', url]) },
		desktopCapturer: { getSources: async (options) => {
			calls.push(['sources', options])
			return [{ id: 'screen:1:0', name: 'Test screen', appIcon: null, thumbnail: { isEmpty: () => false, toDataURL: () => 'data:image/png;base64,test' } }]
		} },
	})
	return { handle, calls }
}

for (const status of ['not-determined', 'granted']) {
	test(`${status} consent reaches screen enumeration without opening Settings`, async () => {
		const { handle, calls } = fixture(status)
		const result = await handle()
		assert.deepEqual(calls.map(([kind]) => kind), ['status', 'sources'])
		assert.equal(result[0].id, 'screen:1:0')
		assert.equal(result[0].thumbnail, 'data:image/png;base64,test')
		assert.equal(result[0].icon, null)
		assert.deepEqual(Array.from(calls[1][1].types), ['screen', 'window'])
		assert.equal(calls[1][1].fetchWindowIcons, true)
	})
}

for (const status of ['denied', 'restricted', 'unknown']) {
	test(`${status} consent retains Settings recovery without enumeration`, async () => {
		const { handle, calls } = fixture(status)
		assert.equal(await handle(), null)
		assert.deepEqual(calls, [
			['status', 'screen'],
			['settings', 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'],
		])
	})
}

test('non-macOS enumeration does not query native screen consent', async () => {
	const { handle, calls } = fixture('denied', false)
	await handle()
	assert.deepEqual(calls.map(([kind]) => kind), ['sources'])
})
