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

for (const redirected of [false, true]) {
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
					isDestroyed: () => false,
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
			assert.equal(executions, 1)
			assert.equal(renderer.window.location.hash, '#' + route)
			assert.equal(renderer.injected, false)
			assert.equal(reloads, redirected ? 0 : 1)
			assert.deepEqual(external, [])
		})
	}
}
