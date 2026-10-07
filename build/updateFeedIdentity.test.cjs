/* SPDX-License-Identifier: AGPL-3.0-or-later */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { createRequire } = require('node:module')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const filename = path.join(__dirname, 'resolveBuildConfig.js')
const nativeRequire = createRequire(filename)
function resolve(profile) {
	const context = {
		URL,
		__dirname,
		module: { exports: {} },
		require: (name) => name === 'node:fs'
			? {
					...fs,
					existsSync: () => profile !== undefined,
					readFileSync: () => JSON.stringify(profile),
				}
			: nativeRequire(name),
	}
	vm.runInNewContext(fs.readFileSync(filename, 'utf8'), context)
	return context.module.exports.resolveBuildConfig()
}

test('update-only deployment preserves existing identity and unbranded menus', () => {
	const original = resolve()
	for (const profile of [
		{ macUpdateFeedUrls: { arm64: 'https://updates.example/mac/', x64: 'https://updates.example/mac/' } },
		{ updateFeedUrl: 'https://updates.example/windows/' },
	]) {
		const updated = resolve(profile)
		for (const key of ['isBranded', 'companyName', 'copyright', 'applicationName', 'appleAppBundleId', 'winAppId', 'winUpgradeCode']) {
			assert.equal(updated[key], original[key], key)
		}
		for (const key of Object.keys(profile)) { assert.equal(JSON.stringify(updated[key]), JSON.stringify(profile[key])) }
	}
})

test('identity customization continues to select branded behavior', () => {
	const result = resolve({ applicationName: 'Example Client', domain: 'https://example.test', macUpdateFeedUrls: {} })
	assert.equal(result.isBranded, true)
	assert.equal(result.companyName, 'Example Client')
	assert.equal(result.appleAppBundleId, 'test.example.talk.mac')
})

test('null overrides do not introduce branding changes', () => {
	assert.equal(resolve({ applicationName: null, macUpdateFeedUrls: {} }).isBranded, false)
})
