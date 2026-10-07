/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const path = require('node:path')

/**
 * Resolve signing independently of optional Apple notarization credentials.
 *
 * @param {string} applicationName Application bundle name
 * @param {object} env Private signing environment
 */
function macosSigning(applicationName, env = process.env) {
	const notarize = !!(env.APPLE_ID && env.APPLE_ID_PASSWORD && env.APPLE_TEAM_ID)
	const identity = env.APPLE_SIGN_IDENTITY || (notarize ? undefined : '-')
	const adhoc = identity === '-'
	if (adhoc && notarize) {
		throw new Error('Notarization requires a Developer ID identity, not ad-hoc signing')
	}
	return {
		osxSign: {
			identity,
			identityValidation: !adhoc,
			// Packager otherwise turns signing failures into successful unsigned builds.
			continueOnError: false,
			preAutoEntitlements: false,
			strictVerify: true,
			optionsForFile(filePath) {
				return {
					// Ad-hoc code has no team identity for runtime library validation.
					hardenedRuntime: !adhoc,
					...(adhoc ? { timestamp: 'none' } : {}),
					// Retain osx-sign's specialized Electron helper entitlements.
					...(path.basename(filePath) === `${applicationName}.app`
						? { entitlements: path.join(__dirname, '../resources/macos/entitlements.plist') }
						: {}),
				}
			},
		},
		osxNotarize: notarize && {
			appleId: env.APPLE_ID,
			appleIdPassword: env.APPLE_ID_PASSWORD,
			teamId: env.APPLE_TEAM_ID,
		},
	}
}

module.exports = { macosSigning }
