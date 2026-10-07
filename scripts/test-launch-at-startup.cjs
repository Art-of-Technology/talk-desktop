/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

const compiled = ts.transpileModule(fs.readFileSync(require.resolve('../src/app/launchAtStartup.config.ts'), 'utf8'), {
	compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

for (const scenario of [
	{ name: 'login item in foreground', login: true, preference: false, explicit: false, expected: false },
	{ name: 'login item in background', login: true, preference: true, explicit: false, expected: true },
	{ name: 'normal launch with background preference', login: false, preference: true, explicit: false, expected: false },
	{ name: 'explicit background overrides foreground preference', login: false, preference: false, explicit: true, expected: true },
	{ name: 'explicit background at login', login: true, preference: false, explicit: true, expected: true },
	{ name: 'platform without login item status', login: undefined, preference: true, explicit: false, expected: false },
]) {
	test(scenario.name, () => {
		const exports = {}
		vm.runInNewContext(compiled, {
			exports,
			require(id) {
				if (id === 'electron') {
					return { app: { getLoginItemSettings: () => ({ wasOpenedAtLogin: scenario.login }) } }
				}
				if (id === './AppConfig.ts') {
					return { getAppConfig(key) {
						assert.equal(key, 'launchAtStartupInBackground')
						return scenario.preference
					} }
				}
				throw new Error(`Unexpected dependency ${id}`)
			},
		})
		assert.equal(exports.shouldOpenInBackground(scenario.explicit), scenario.expected)
	})
}
