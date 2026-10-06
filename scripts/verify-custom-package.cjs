const asar = require('@electron/asar')
/*
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const { readFileSync } = require('node:fs')
const path = require('node:path')

const archive = process.argv[2]
assert(archive, 'Usage: node scripts/verify-custom-package.cjs <app.asar>')
const hash = (data) => createHash('sha256').update(data).digest('hex')
const expected = '001cd78615b585e6b3ff883dd88f533a5ed8762cf5928efa7b3ce8af25eba1ff'
const source = path.join(__dirname, '../sounds/notification.ogg')
assert.equal(hash(readFileSync(source)), expected)
const sounds = asar.listPackage(archive).filter((file) => file.endsWith('.ogg'))
const bundledHashes = sounds.map((file) => hash(asar.extractFile(archive, file.replace(/^[\\/]/, ''))))
assert(bundledHashes.includes(expected), 'Custom message audio missing from packaged app')
assert(bundledHashes.includes(hash(readFileSync(path.join(__dirname, '../sounds/talk.ogg')))), 'Call audio missing from packaged app')
const pkg = JSON.parse(asar.extractFile(archive, 'package.json').toString())
assert.equal(pkg.version, process.argv[3] ?? require('../package.json').version)
console.log(JSON.stringify({ version: pkg.version, customAudio: expected, callAudioPresent: true, packagedSounds: sounds.length }))
