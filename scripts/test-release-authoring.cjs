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
const { review, stage, validateManifest } = require('./release-authoring.cjs')

/**
 * Build a minimal stored ZIP fixture with genuine NuGet metadata.
 *
 * @param {string} version Embedded package version
 */
function packageFixture(version) {
	const name = Buffer.from('Example.nuspec')
	const content = Buffer.from(`<package><metadata><version>${version}</version></metadata></package>`)
	let crc = 0xffffffff
	for (const byte of content) {
		crc ^= byte
		for (let bit = 0; bit < 8; bit++) {
			crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
		}
	}
	const local = Buffer.alloc(30)
	local.writeUInt32LE(0x04034b50)
	local.writeUInt16LE(20, 4)
	local.writeUInt32LE((crc ^ 0xffffffff) >>> 0, 14)
	local.writeUInt32LE(content.length, 18)
	local.writeUInt32LE(content.length, 22)
	local.writeUInt16LE(name.length, 26)
	const central = Buffer.alloc(46)
	central.writeUInt32LE(0x02014b50)
	central.writeUInt16LE(20, 4)
	central.writeUInt16LE(20, 6)
	central.writeUInt32LE((crc ^ 0xffffffff) >>> 0, 16)
	central.writeUInt32LE(content.length, 20)
	central.writeUInt32LE(content.length, 24)
	central.writeUInt16LE(name.length, 28)
	const end = Buffer.alloc(22)
	end.writeUInt32LE(0x06054b50)
	end.writeUInt16LE(1, 8)
	end.writeUInt16LE(1, 10)
	end.writeUInt32LE(central.length + name.length, 12)
	end.writeUInt32LE(local.length + name.length + content.length, 16)
	return Buffer.concat([local, name, content, central, name, end])
}

/**
 *
 * @param {object} t Test context
 */
function fixture(t) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-authoring-'))
	t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
	const manifest = { schemaVersion: 1, latestVersion: '1.2.3', releases: [{ version: '1.2.3', title: 'Clearer update controls', summary: ['Choose when to update.'], sections: [{ heading: 'Updates', body: 'Review the changes before downloading.', images: [] }], mandatory: false, graceMinutes: 15 }] }
	const metadata = path.join(dir, 'draft.json')
	fs.writeFileSync(metadata, JSON.stringify(manifest))
	const packagePath = path.join(dir, 'renamed.nupkg')
	fs.writeFileSync(packagePath, packageFixture('1.2.3'))
	const packageBytes = fs.readFileSync(packagePath)
	const releases = path.join(dir, 'RELEASES')
	fs.writeFileSync(releases, `${crypto.createHash('sha1').update(packageBytes).digest('hex')} Example-1.2.3-full.nupkg ${packageBytes.length}\n`)
	return { dir, manifest, metadata, args: [metadata, 'https://updates.example/desktop/', releases, packagePath] }
}
/**
 *
 * @param {string} dir Temporary test directory
 * @param {object} record Reviewed fixture binding
 */
function approve(dir, record) {
	const file = path.join(dir, 'approval.json')
	fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, decision: 'approved', approvedBy: 'Fixture reviewer', approvedAt: '2026-10-06T12:00:00Z', digest: record.digest }))
	return file
}
test('review produces both notes and policy without manufacturing approval or staging', async (t) => {
	const { dir, args } = fixture(t)
	const record = await review(...args)
	assert.equal(record.notes.summary[0], 'Choose when to update.')
	assert.equal(record.notes.sections[0].heading, 'Updates')
	assert.equal(record.notes.mandatory, false)
	assert.match(record.digest, /^[a-f0-9]{64}$/)
	assert.equal(fs.existsSync(path.join(dir, 'approval.json')), false)
})
test('approved exact bytes produce a pinned immutable bundle; cannot overwrite', async (t) => {
	const { dir, args } = fixture(t)
	const record = await review(...args)
	const approval = approve(dir, record)
	const output = path.join(dir, 'bundle')
	await stage(...args, approval, output)
	assert.equal(fs.existsSync(path.join(output, 'releases', '1.2.3', 'RELEASES')), true)
	assert.equal(fs.readFileSync(path.join(output, 'release-manifest.json'), 'utf8'), fs.readFileSync(args[0], 'utf8'))
	await assert.rejects(stage(...args, approval, output), /fresh publication/)
})
test('changed notes, mandatory policy, destination or package invalidate approval', async (t) => {
	const { dir, args, manifest, metadata } = fixture(t)
	const approval = approve(dir, await review(...args))
	for (const changed of [
		{ ...manifest, releases: [{ ...manifest.releases[0], title: 'Changed notes' }] },
		{ ...manifest, releases: [{ ...manifest.releases[0], mandatory: true }] },
	]) {
		fs.writeFileSync(metadata, JSON.stringify(changed))
		await assert.rejects(stage(...args, approval, path.join(dir, 'bundle')), /approval/)
	}
	fs.writeFileSync(metadata, JSON.stringify(manifest))
	await assert.rejects(stage(args[0], 'https://other.example/desktop/', ...args.slice(2), approval, path.join(dir, 'bundle')), /approval/)
	fs.appendFileSync(args[3], 'changed')
	await assert.rejects(stage(...args, approval, path.join(dir, 'bundle')), /match RELEASES/)
	assert.equal(fs.existsSync(path.join(dir, 'bundle')), false)
})
test('rejects absent decision and untrusted screenshot URLs', async (t) => {
	const { dir, args, manifest } = fixture(t)
	const approval = path.join(dir, 'approval.json')
	fs.writeFileSync(approval, JSON.stringify(await review(...args)))
	await assert.rejects(stage(...args, approval, path.join(dir, 'bundle')), /approval/)
	for (const url of ['http://updates.example/desktop/a.png', 'https://evil.example/a.png', 'https://updates.example/other/a.png', 'https://updates.example/desktop/%2e%2e/other.png', 'https://user:pass@updates.example/desktop/a.png']) {
		manifest.releases[0].sections[0].images = [{ url, alt: 'Screenshot' }]
		assert.throws(() => validateManifest(manifest, args[1]), /Invalid image/)
	}
})
test('rejects mismatched package version before approval', async (t) => {
	const { args } = fixture(t)
	fs.writeFileSync(args[2], fs.readFileSync(args[2], 'utf8').replace('1.2.3', '1.2.4'))
	await assert.rejects(review(...args), /filename version/)
})
test('publication requires both kinds of release notes', async (t) => {
	const { args, manifest, metadata } = fixture(t)
	manifest.releases[0].sections = []
	fs.writeFileSync(metadata, JSON.stringify(manifest))
	await assert.rejects(review(...args), /both short summary and detailed/)
})
test('rejects a package whose real metadata version differs despite matching filename', async (t) => {
	const { args } = fixture(t)
	const bytes = packageFixture('9.0.0')
	fs.writeFileSync(args[3], bytes)
	fs.writeFileSync(args[2], `${crypto.createHash('sha1').update(bytes).digest('hex')} Example-1.2.3-full.nupkg ${bytes.length}\n`)
	await assert.rejects(review(...args), /Embedded package version/)
})
test('screenshots must exist, match image bytes, and remain identical to approval', async (t) => {
	const { args, dir, manifest, metadata } = fixture(t)
	manifest.releases[0].sections[0].images = [{ url: 'https://updates.example/desktop/assets/1.2.3/notice.png', alt: 'Notice' }]
	fs.writeFileSync(metadata, JSON.stringify(manifest))
	await assert.rejects(review(...args), /ENOENT/)
	const image = path.join(dir, 'assets', '1.2.3', 'notice.png')
	fs.mkdirSync(path.dirname(image), { recursive: true })
	fs.writeFileSync(image, '<html>not an image</html>')
	await assert.rejects(review(...args), /content does not match/)
	fs.writeFileSync(image, Buffer.from('89504e470d0a1a0a00000000', 'hex'))
	const record = await review(...args)
	assert.equal(record.screenshots.length, 1)
	const approval = approve(dir, record)
	const output = path.join(dir, 'bundle')
	await stage(...args, approval, output)
	assert.deepEqual(fs.readFileSync(path.join(output, 'assets', '1.2.3', 'notice.png')), fs.readFileSync(image))
	fs.appendFileSync(image, 'changed')
	await assert.rejects(stage(...args, approval, path.join(dir, 'changed-bundle')), /approval/)
})
