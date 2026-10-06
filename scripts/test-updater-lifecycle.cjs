/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const { isSquirrelMaintenance } = require('../src/app/squirrelMaintenance.js')

const maintenanceFlags = ['--squirrel-install', '--squirrel-updated', '--squirrel-uninstall', '--squirrel-obsolete']
const entry = fs.readFileSync(require.resolve('../src/main.js'), 'utf8')
const squirrel = fs.readFileSync(require.resolve('electron-squirrel-startup'), 'utf8')

for (const flag of [...maintenanceFlags, '--squirrel-firstrun', undefined]) {
	test(`entrypoint handles ${flag ?? 'normal launch'} without racing shortcut completion`, () => {
		let quits = 0
		let bootstraps = 0
		let shortcutDone
		const args = []
		const sandbox = {
			module: { exports: {} },
			process: { platform: 'win32', argv: ['client.exe', flag], execPath: '/app/client.exe' },
			require(id) {
				if (id === 'electron') {
					return { app: { quit: () => quits++ } }
				}
				if (id === 'path') {
					return path
				}
				if (id === 'debug') {
					return () => () => {}
				}
				if (id === 'child_process') {
					return { spawn: (file, argv) => {
						args.push(...argv)
						return { on: (event, done) => {
							assert.equal(event, 'close')
							shortcutDone = done
						} }
					} }
				}
				throw new Error(`Unexpected maintenance import: ${id}`)
			},
		}
		vm.runInNewContext(entry, { require(id) {
			if (id === 'electron-squirrel-startup') {
				vm.runInNewContext(squirrel, sandbox)
				return sandbox.module.exports
			}
			assert.equal(id, './bootstrap.js')
			bootstraps++
		} })
		assert.equal(bootstraps, maintenanceFlags.includes(flag) ? 0 : 1)
		if (shortcutDone) {
			assert.equal(quits, 0, 'shortcut helper must finish before quitting')
			assert.match(args[0], flag === '--squirrel-uninstall' ? /^--removeShortcut=/ : /^--createShortcut=/)
			shortcutDone()
			assert.equal(quits, 1)
		} else {
			assert.equal(quits, flag === '--squirrel-obsolete' ? 1 : 0)
		}
	})
}

// Execute the actual registered handler with side effects stubbed, including the
// normal installation-switch branch. Fail if its registration shape changes.
const bootstrap = fs.readFileSync(require.resolve('../src/bootstrap.js'), 'utf8')
const start = bootstrap.indexOf("app.on('second-instance',")
const end = bootstrap.indexOf('\n\t// Allow requests to a server', start)
assert.ok(start >= 0 && end > start)

for (const flag of [...maintenanceFlags, '--squirrel-firstrun', undefined]) {
	test(`running app handles second instance ${flag ?? 'normal launch'}`, async () => {
		const effects = []
		let handler
		let spawned
		vm.runInNewContext(bootstrap.slice(start, end), {
			app: {
				on: (event, callback) => { handler = callback },
				releaseSingleInstanceLock: () => effects.push('release'),
				quit: () => effects.push('quit'),
			},
			isWindows: true,
			isSquirrelMaintenance,
			isSameExecution: () => false,
			focusMainWindow: () => effects.push('focus'),
			calls: { endCall: async () => {
				effects.push('endCall')
				return true
			} },
			path,
			console,
			spawn: () => {
				effects.push('spawn')
				const child = { on: (event, callback) => {
					if (event === 'spawn') {
						spawned = callback
					}
					return child
				}, unref: () => effects.push('unref') }
				return child
			},
		})
		await handler({}, ['/other/client.exe', flag], '/other')
		if (maintenanceFlags.includes(flag)) {
			assert.deepEqual(effects, [])
		} else {
			assert.deepEqual(effects, ['endCall', 'release', 'spawn'])
			spawned()
			assert.deepEqual(effects, ['endCall', 'release', 'spawn', 'unref', 'quit'])
		}
	})
}
