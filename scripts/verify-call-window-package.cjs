/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const asar = require('@electron/asar')
const assert = require('node:assert/strict')

const archive = process.argv[2]
assert(archive, 'Usage: node scripts/verify-call-window-package.cjs <app.asar>')
const chunks = asar.listPackage(archive)
	.filter((file) => /[\\/]renderer[\\/].*\.js$/.test(file))
	.map((file) => asar.extractFile(archive, file.replace(/^[\\/]/, '')).toString())

// Direct loader tests do not prove Vue's script subrequests used the loader.
// These diagnostics occur only inside the injected try/catch callbacks.
assert(chunks.some((source) => source.includes('Call join was not completed')
	&& source.includes('shouldStartRecording')), 'Patched join callback missing from renderer bundle')
assert(chunks.some((source) => source.includes('Could not leave the call from its button')
	&& source.includes('desktopExplicitLeave')), 'Patched explicit leave callback missing from renderer bundle')
console.log('PASS: packaged renderer contains the patched join and explicit leave callbacks')
