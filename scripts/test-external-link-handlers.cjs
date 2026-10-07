/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

const compiled = ts.transpileModule(fs.readFileSync(require.resolve('../src/app/externalLinkHandlers.ts'), 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

for (const redirected of [false, true, 'closed']) {
	for (const route of ['/call/room123?view=chat#message42', "/call/room123#';globalThis.injected=true;//"]) {
		test(`navigation treats route as data (redirected=${redirected}, route=${route})`, async () => {
			const handlers = {}
			const external = []
			const exports = {}
			vm.runInNewContext(compiled, {
				exports,
				URL,
				process,
				require(id) {
					if (id === 'electron') {
						return { shell: { openExternal: (url) => external.push(url) } }
					}
					if (id === './AppData.js') {
						return { appData: { serverUrl: 'https://chat.example' } }
					}
					if (id === './utils.ts') {
						return { isExternalUrl: () => true }
					}
					throw new Error(`Unexpected dependency ${id}`)
				},
			})
			const source = { webContents: {
				on: (name, handler) => { handlers[name] = handler },
				setWindowOpenHandler() {},
			} }
			const renderer = { window: { location: { hash: '' } }, injected: false }
			let executions = 0
			let reloads = 0
			const frame = {
				async executeJavaScript(code) {
					executions++
					vm.runInNewContext(code, renderer)
				},
				reload() { reloads++ },
			}
			if (redirected) {
				exports.setInternalNavigationTarget(source, () => ({
					isDestroyed: () => redirected === 'closed',
					isMinimized: () => false,
					show() {},
					webContents: frame,
				}))
			}
			exports.applyExternalLinkHandler(source)
			let prevented = false
			await handlers['will-navigate']({
				url: `https://chat.example${route}`,
				initiator: frame,
				preventDefault() { prevented = true },
			})
			assert.equal(prevented, true)
			assert.equal(executions, redirected === 'closed' ? 0 : 1)
			assert.equal(renderer.window.location.hash, redirected === 'closed' ? '' : '#' + route)
			assert.equal(renderer.injected, false)
			assert.equal(reloads, redirected ? 0 : 1)
			assert.deepEqual(external, [])
		})
	}
}

test('promoted call navigation focuses or recreates chat before resolving its target', () => {
	const bootstrap = fs.readFileSync(require.resolve('../src/bootstrap.js'), 'utf8')
	const start = bootstrap.indexOf('onPromote: ')
	const end = bootstrap.indexOf('\n\t\tonLeaveTimeout:', start)
	assert.ok(start >= 0 && end > start, 'locate actual bootstrap navigation resolver')
	const callback = bootstrap.slice(start + 'onPromote: '.length, end).trim().replace(/,$/, '')
	const source = {}
	const oldChat = { destroyed: true }
	const recreatedChat = { destroyed: false }
	let current = oldChat
	let resolver
	const promote = vm.runInNewContext(`(${callback})`, {
		get mainWindow() { return current },
		focusMainWindow() { current = recreatedChat },
		setInternalNavigationTarget(owner, target) {
			assert.equal(owner, source)
			resolver = target
		},
	})
	promote(source)
	assert.equal(resolver(), recreatedChat)
})
