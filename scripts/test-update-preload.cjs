/* SPDX-License-Identifier: AGPL-3.0-or-later */
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const packageInfo = require('../package.json')
const { UpdateNoticeState } = require('../src/talk/renderer/updates/UpdateNoticeState.js')

test('preload supplies installed version for update notice isolation and cleans notification listeners', () => {
	const ipc = new EventEmitter()
	const calls = []
	ipc.invoke = (...args) => {
		calls.push(args)
		return Promise.resolve()
	}
	let bridge
	vm.runInNewContext(readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8'), {
		require: (name) => {
			if (name === '../package.json') {
				return packageInfo
			}
			assert.equal(name, 'electron')
			return {
				ipcRenderer: ipc,
				contextBridge: { exposeInMainWorld: (key, value) => { bridge = value } },
			}
		},
	})
	assert.equal(bridge.packageInfo.version, packageInfo.version)
	assert.match(bridge.packageInfo.version, /^\d+\.\d+\.\d+/)
	const current = new UpdateNoticeState({ storage: { getItem: () => null }, installedVersion: bridge.packageInfo.version })
	const other = new UpdateNoticeState({ storage: { getItem: () => null }, installedVersion: '0.0.0' })
	assert.notEqual(current.storageKey, other.storageKey)
	let notices = 0
	const unsubscribe = bridge.onDesktopUpdateShow(() => notices++)
	ipc.emit('desktop-update:show')
	assert.equal(notices, 1)
	unsubscribe()
	ipc.emit('desktop-update:show')
	assert.equal(notices, 1)
	bridge.checkDesktopUpdate()
	bridge.downloadDesktopUpdate()
	bridge.acknowledgeDesktopRelease('2.3.5')
	bridge.desktopUpdateNoticeShown()
	bridge.quitForDesktopUpdate()
	assert.deepEqual(calls, [
		['desktop-update:check'],
		['desktop-update:download'],
		['desktop-update:acknowledge-notes', '2.3.5'],
		['desktop-update:notice-shown'],
		['desktop-update:quit'],
	])
})
