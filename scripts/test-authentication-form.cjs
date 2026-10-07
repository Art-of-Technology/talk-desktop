const { parse, compileScript } = require('@vue/compiler-sfc')
/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
const vue = require('vue')

/**
 * Compile the real setup with isolated account and certificate services.
 *
 * @param {string} [account] Previously saved account
 */
function form(account) {
	const file = require.resolve('../src/authentication/renderer/AuthenticationApp.vue')
	const { descriptor } = parse(fs.readFileSync(file, 'utf8'), { filename: file })
	const compiled = compileScript(descriptor, { id: 'authentication-test' })
	const code = ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
	const exports = {}
	const saved = []
	const verified = []
	const dependency = (id) => {
		if (id === 'vue') {
			return { ...vue, onMounted() {} }
		}
		if (id === '@nextcloud/l10n') {
			return { translate: (_, message) => message }
		}
		if (id.endsWith('appConfig.service.ts')) {
			return { getAppConfigValue: () => account ? [account] : [], setAppConfigValue: (...args) => saved.push(args) }
		}
		if (id.endsWith('accounts.utils.ts')) {
			return { parseAccountId: () => account ? { serverUrl: 'https://chat.example' } : null }
		}
		if (id.endsWith('build.config.ts')) {
			return { BUILD_CONFIG: {} }
		}
		return { __esModule: true, default: {} }
	}
	new Function('require', 'exports', 'window', '__CHANNEL__', '__VERSION_TAG__', code)(dependency, exports, {
		TALK_DESKTOP: { verifyCertificate: async (url) => {
			verified.push(url)
			return false
		} },
	}, 'stable', 'test')
	return { state: exports.default.setup({}, { expose() {} }), saved, verified }
}

test('fresh installation with no server returns a validation error without getting stuck', async () => {
	const { state, verified } = form()
	await state.login()
	assert.equal(state.state.value, 'error')
	assert.equal(state.stateText.value, 'Invalid server address')
	assert.deepEqual(verified, [])
})

test('clear saved server resets accounts without assigning a constant or missing variable', () => {
	const { state, saved } = form('user@chat.example')
	assert.equal(state.rawServerUrl.value, 'https://chat.example')
	state.reset()
	assert.equal(state.rawServerUrl.value, '')
	assert.equal(state.state.value, 'idle')
	assert.deepEqual(saved, [['accounts', []]])
})

test('pasted server address is trimmed before adding protocol and removing slash', async () => {
	const { state, verified } = form()
	state.rawServerUrl.value = '  https://chat.example/  '
	assert.equal(state.serverUrl.value, 'https://chat.example')
	await state.login()
	assert.deepEqual(verified, ['https://chat.example'])
	assert.equal(state.state.value, 'error')
	assert.equal(state.stateText.value, 'SSL certificate error')
})

test('cleared and invalid addresses remain retryable without network requests', async () => {
	const { state, verified } = form('user@chat.example')
	state.reset()
	for (const address of ['', '   ', 'https://?invalid']) {
		state.rawServerUrl.value = address
		await state.login()
		assert.equal(state.state.value, 'error')
	}
	assert.deepEqual(verified, [])
})
