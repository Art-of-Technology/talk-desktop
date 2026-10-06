/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const { parseManifest, stageUpdate } = require('./stage-desktop-update.cjs')

const content = Buffer.from('test full package')
const sha1 = crypto.createHash('sha1').update(content).digest('hex')
const manifest = `${sha1} ExampleClient-1.0.1-full.nupkg ${content.length}\n`

test('stages renamed output under manifest filename and restores RELEASES', async (t) => {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-stage-test-'))
	t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
	fs.writeFileSync(path.join(temp, 'renamed-manifest'), manifest)
	fs.writeFileSync(path.join(temp, 'renamed.nupkg'), content)
	const output = path.join(temp, 'feed')
	const result = await stageUpdate(path.join(temp, 'renamed-manifest'), path.join(temp, 'renamed.nupkg'), output)
	assert.equal(result.filename, 'ExampleClient-1.0.1-full.nupkg')
	assert.equal(fs.readFileSync(path.join(output, 'RELEASES'), 'utf8'), manifest)
	assert.deepEqual(fs.readFileSync(path.join(output, result.filename)), content)
	await assert.rejects(stageUpdate(path.join(temp, 'renamed-manifest'), path.join(temp, 'renamed.nupkg'), output), /fresh staging directory/)
})

test('refuses corrupt bytes before making output', async (t) => {
	const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-stage-test-'))
	t.after(() => fs.rmSync(temp, { recursive: true, force: true }))
	fs.writeFileSync(path.join(temp, 'RELEASES'), manifest)
	fs.writeFileSync(path.join(temp, 'package'), Buffer.alloc(content.length))
	const output = path.join(temp, 'feed')
	await assert.rejects(stageUpdate(path.join(temp, 'RELEASES'), path.join(temp, 'package'), output), /does not match/)
	assert.equal(fs.existsSync(output), false)
})

test('rejects traversal, URL filenames, malformed hashes, deltas and ambiguous manifests', () => {
	for (const name of ['../package-full.nupkg', '..\\package-full.nupkg', 'https://example.test/a-full.nupkg', 'a-delta.nupkg', '/a-full.nupkg']) {
		assert.throws(() => parseManifest(`${sha1} ${name} 10`))
	}
	assert.throws(() => parseManifest('bad a-full.nupkg 10'))
	assert.throws(() => parseManifest(manifest + manifest))
	assert.throws(() => parseManifest(`${sha1} a-full.nupkg 9007199254740992`))
})
