/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { macosSigning } = require('./macosSigning.cjs')

test('internal packaging signs completely without notarization credentials', () => {
	const { osxSign, osxNotarize } = macosSigning('Talk', {})
	assert.equal(osxSign.identity, '-')
	assert.equal(osxSign.identityValidation, false)
	assert.equal(osxSign.continueOnError, false)
	assert.equal(osxSign.strictVerify, true)
	assert.equal(osxNotarize, false)
	assert.equal(osxSign.optionsForFile('/out/Talk.app').timestamp, 'none')
	assert.equal(osxSign.optionsForFile('/out/Talk.app').hardenedRuntime, false)
	assert.match(osxSign.optionsForFile('/out/Talk.app').entitlements, /entitlements\.plist$/)
	assert.equal(osxSign.optionsForFile('/out/Talk.app/Contents/Frameworks/Talk Helper (Renderer).app').entitlements, undefined)
})

test('certificate signing is independent of notarization', () => {
	const { osxSign, osxNotarize } = macosSigning('Talk', { APPLE_SIGN_IDENTITY: 'test-identity' })
	assert.equal(osxSign.identity, 'test-identity')
	assert.equal(osxSign.identityValidation, true)
	assert.equal(osxSign.optionsForFile('/out/Talk.app').timestamp, undefined)
	assert.equal(osxSign.optionsForFile('/out/Talk.app').hardenedRuntime, true)
	assert.equal(osxNotarize, false)
})

test('notarized builds retain Developer ID discovery and reject ad-hoc identity', () => {
	const env = { APPLE_ID: 'test', APPLE_ID_PASSWORD: 'test', APPLE_TEAM_ID: 'test' }
	assert.equal(macosSigning('Talk', env).osxSign.identity, undefined)
	assert.equal(macosSigning('Talk', env).osxNotarize.teamId, 'test')
	assert.throws(() => macosSigning('Talk', { ...env, APPLE_SIGN_IDENTITY: '-' }), /Developer ID/)
})
