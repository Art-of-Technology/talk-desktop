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
const { review, stage } = require('./mac-release-authoring.cjs')

/**
 * A trailer fixture exercises byte binding, not actual Mac installability.
 *
 * @param {object} t Test context
 */
function fixture(t) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-authoring-'))
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
	const dmg = Buffer.alloc(1024)
	dmg.write('koly', dmg.length - 512)
	const artifact = path.join(dir, 'local-build.dmg')
	fs.writeFileSync(artifact, dmg)
	const release = { version: '1.2.3', title: 'Update controls', summary: ['Read changes before downloading.'], sections: [{ heading: 'Updates', body: 'Download and install the new release manually.', images: [] }], mandatory: false, graceMinutes: 15, macDownload: { url: 'https://updates.example/mac/releases/1.2.3/Example.dmg', sha256: crypto.createHash('sha256').update(dmg).digest('hex'), size: dmg.length, arch: 'arm64', signing: 'unsigned' } }
	const older = { ...release, version: '1.2.2', title: 'Previous changes', macDownload: { ...release.macDownload, url: 'https://updates.example/mac/releases/1.2.2/Example.dmg' } }
	const manifest = { schemaVersion: 1, latestVersion: '1.2.3', releases: [release, older] }
	const metadata = path.join(dir, 'draft.json')
	fs.writeFileSync(metadata, JSON.stringify(manifest, null, 2) + '\n')
	return { dir, manifest, metadata, args: [metadata, 'https://updates.example/mac/', 'arm64', artifact], output: path.join(dir, 'bundle') }
}

/**
 * Synthetic approval for tests only.
 *
 * @param {string} dir Fixture directory
 * @param {object} record Reviewed binding
 */
function approve(dir, record) {
	const filename = path.join(dir, 'approval.json')
	fs.writeFileSync(filename, JSON.stringify({ schemaVersion: 1, decision: 'approved', approvedBy: 'Test reviewer', approvedAt: '2026-10-07T10:00:00Z', digest: record.digest }))
	return filename
}

test('review binds notes, feed, architecture and exact bytes without approving', async (t) => {
	const { dir, args } = fixture(t)
	const record = await review(...args)
	assert.equal(record.architecture, 'arm64')
	assert.equal(record.notes.mandatory, false)
	assert.equal(record.notes.macDownload.signing, 'unsigned')
	assert.equal(record.dmgFilename, 'Example.dmg')
	assert.match(record.digest, /^[a-f0-9]{64}$/)
	assert.equal(fs.existsSync(path.join(dir, 'approval.json')), false)
})

test('stage preserves original metadata, historical notes and approved DMG bytes with explicit destination rename', async (t) => {
	const { dir, args, output } = fixture(t)
	const approval = approve(dir, await review(...args))
	await stage(...args, approval, output)
	assert.deepEqual(fs.readFileSync(path.join(output, 'release-manifest.json')), fs.readFileSync(args[0]))
	assert.deepEqual(fs.readFileSync(path.join(output, 'releases', '1.2.3', 'Example.dmg')), fs.readFileSync(args[3]))
	assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'approval-record.json'))).approval.decision, 'approved')
	await assert.rejects(stage(...args, approval, output), /fresh publication/)
	assert.deepEqual(fs.readFileSync(path.join(output, 'release-manifest.json')), fs.readFileSync(args[0]))
})

test('ad-hoc review and staging preserve signing status alongside unsigned history', async (t) => {
	const { dir, args, manifest, metadata, output } = fixture(t)
	const unsigned = await review(...args)
	manifest.releases[0].macDownload.signing = 'ad-hoc'
	fs.writeFileSync(metadata, JSON.stringify(manifest))
	const record = await review(...args)
	assert.equal(record.notes.macDownload.signing, 'ad-hoc')
	assert.notEqual(record.digest, unsigned.digest)
	await assert.rejects(stage(...args, approve(dir, unsigned), output), /approval/)
	await stage(...args, approve(dir, record), output)
	const staged = JSON.parse(fs.readFileSync(path.join(output, 'release-manifest.json')))
	assert.equal(staged.releases[0].macDownload.signing, 'ad-hoc')
	assert.equal(staged.releases[1].macDownload.signing, 'unsigned')
	assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'approval-record.json'))).review.notes.macDownload.signing, 'ad-hoc')
})

test('missing or incomplete approval never creates a bundle', async (t) => {
	const { dir, args, output } = fixture(t)
	const record = await review(...args)
	const file = approve(dir, record)
	const valid = JSON.parse(fs.readFileSync(file))
	for (const change of [{ decision: 'draft' }, { digest: '0'.repeat(64) }, { approvedBy: '' }, { approvedAt: 'not a date' }, { approvedAt: 123 }, { schemaVersion: 2 }]) {
		fs.writeFileSync(file, JSON.stringify({ ...valid, ...change }))
		await assert.rejects(stage(...args, file, output), /approval/)
		assert.equal(fs.existsSync(output), false)
	}
})

test('whitespace-only metadata changes invalidate approval', async (t) => {
	const { dir, args, output } = fixture(t)
	const file = approve(dir, await review(...args))
	fs.appendFileSync(args[0], '\n')
	await assert.rejects(stage(...args, file, output), /approval/)
	assert.equal(fs.existsSync(output), false)
})

test('changed DMG, incorrect size and missing UDIF trailer are rejected', async (t) => {
	const { args, manifest, metadata } = fixture(t)
	manifest.releases[0].macDownload.size++
	fs.writeFileSync(metadata, JSON.stringify(manifest))
	await assert.rejects(review(...args), /hash or size/)
	manifest.releases[0].macDownload.size--
	fs.writeFileSync(metadata, JSON.stringify(manifest))
	const bytes = fs.readFileSync(args[3])
	bytes[0] = 1
	fs.writeFileSync(args[3], bytes)
	await assert.rejects(review(...args), /hash or size/)
	fs.writeFileSync(args[3], 'not a DMG')
	await assert.rejects(review(...args), /UDIF/)
})

test('invalid metadata, mandatory updates, architecture mismatch and screenshots fail closed', async (t) => {
	const { args, manifest, metadata } = fixture(t)
	for (const update of [
		{ mandatory: true },
		{ sections: [] },
		{ macDownload: { ...manifest.releases[0].macDownload, arch: 'x64' } },
		{ macDownload: { ...manifest.releases[0].macDownload, signing: 'notarized' } },
		{ macDownload: { ...manifest.releases[0].macDownload, url: 'https://other.example/file.dmg' } },
		{ sections: [{ heading: 'Images', body: 'Screenshot', images: [{ url: 'https://updates.example/mac/assets/1.2.3/example.png', alt: 'Example' }] }] },
	]) {
		const changed = { ...manifest, releases: [{ ...manifest.releases[0], ...update }, manifest.releases[1]] }
		fs.writeFileSync(metadata, JSON.stringify(changed))
		await assert.rejects(review(...args))
	}
	fs.writeFileSync(metadata, '{')
	await assert.rejects(review(...args), SyntaxError)
})

test('a failed copy cleans only its newly created bundle', async (t) => {
	const { dir, args, output } = fixture(t)
	const file = approve(dir, await review(...args))
	const original = fs.copyFileSync
	t.mock.method(fs, 'copyFileSync', (...copyArgs) => {
		original(...copyArgs)
		throw new Error('Simulated copy failure')
	})
	await assert.rejects(stage(...args, file, output), /Simulated copy failure/)
	assert.equal(fs.existsSync(output), false)
	assert.equal(fs.existsSync(args[3]), true)
	assert.equal(fs.existsSync(file), true)
})

test('source change during copy fails recheck and removes incomplete bundle', async (t) => {
	const { dir, args, output } = fixture(t)
	const file = approve(dir, await review(...args))
	const original = fs.copyFileSync
	t.mock.method(fs, 'copyFileSync', (...copyArgs) => {
		original(...copyArgs)
		fs.appendFileSync(args[0], '\n')
	})
	await assert.rejects(stage(...args, file, output), /Metadata changed/)
	assert.equal(fs.existsSync(output), false)
})
