/* SPDX-License-Identifier: AGPL-3.0-or-later */
const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const { MacUpdateDownload } = require('../src/app/MacUpdateDownload.js')

const bytes = Buffer.from('a simulated disk image')
const artifact = {
	url: 'https://updates.example.test/releases/2.4.0/client-arm64.dmg',
	sha256: createHash('sha256').update(bytes).digest('hex'),
	size: bytes.length,
	arch: 'arm64',
	signing: 'unsigned',
}

/**
 * Create an in-memory fetch response.
 *
 * @param {Buffer[]} chunks Body chunks.
 * @param {object} overrides Response overrides.
 */
function response(chunks = [bytes], overrides = {}) {
	return {
		ok: true,
		redirected: false,
		url: artifact.url,
		headers: new Headers(),
		body: new ReadableStream({
			start(controller) {
				for (const chunk of chunks) {
					controller.enqueue(chunk)
				}
				controller.close()
			},
		}),
		...overrides,
	}
}

/**
 * Create a downloader with isolated temporary storage.
 *
 * @param {object} t Test context.
 * @param {(url: string, options: object) => object} fetch Injected transport.
 * @param {object} options Downloader options.
 */
async function fixture(t, fetch, options = {}) {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mac-download-test-'))
	const adapter = new MacUpdateDownload({ fetch, downloadsPath: directory, ...options })
	t.after(async () => {
		adapter.dispose()
		await fs.rm(directory, { recursive: true, force: true })
	})
	return { directory, adapter }
}

test('streams a verified file into a new directory on every download', async (t) => {
	const { directory, adapter } = await fixture(t, async (url, options) => {
		assert.equal(url, artifact.url)
		assert.equal(options.credentials, 'omit')
		assert.equal(options.redirect, 'error')
		assert.equal(options.cache, 'no-store')
		assert.ok(options.signal instanceof AbortSignal)
		const pending = (await fs.readdir(directory)).at(-1)
		const contents = await Promise.all((await fs.readdir(directory)).map((name) => fs.readdir(path.join(directory, name))))
		assert.ok(pending)
		assert.ok(contents.some((names) => names.includes('client-arm64.dmg.part')))
		return response([bytes.subarray(0, 3), bytes.subarray(3)])
	})
	const first = await adapter.download(artifact, '2.4.0')
	const second = await adapter.download({ ...artifact, arch: 'universal' }, '2.4.0')
	assert.notEqual(first, second)
	assert.equal(path.dirname(path.dirname(first)), directory)
	assert.equal(path.basename(first), 'client-arm64.dmg')
	assert.deepEqual(await fs.readFile(first), bytes)
	if (process.platform !== 'win32') {
		assert.equal((await fs.stat(first)).mode & 0o777, 0o600)
		assert.equal((await fs.stat(path.dirname(first))).mode & 0o777, 0o700)
	}
})

const failures = {
	'hash mismatch': () => response([Buffer.alloc(bytes.length)]),
	'truncated body': () => response([bytes.subarray(1)]),
	'body overrun': () => response([bytes, Buffer.from('extra')]),
	'length header mismatch': () => response([], { headers: new Headers({ 'content-length': '1' }) }),
	'redirect flag': () => response([], { redirected: true }),
	'different response URL': () => response([], { url: 'https://other.example.test/client.dmg' }),
	'HTTP error': () => response([], { ok: false }),
	'missing body': () => response([], { body: null }),
	'network error': () => { throw new Error('private transport details') },
	'stream error': () => response([], { body: new ReadableStream({ start(c) { c.error(new Error('private stream details')) } }) }),
	'fetch timeout': () => new Promise(() => {}),
	'stream timeout': () => response([], { body: new ReadableStream({ pull() { return new Promise(() => {}) } }) }),
}
for (const [name, fetch] of Object.entries(failures)) {
	test(`${name} removes all partial files`, async (t) => {
		const { directory, adapter } = await fixture(t, fetch, { timeout: 100 })
		await assert.rejects(adapter.download(artifact, '2.4.0'), { message: 'Unable to download and verify macOS installer' })
		assert.deepEqual(await fs.readdir(directory), [])
	})
}

test('rejects unsafe URLs, filenames and metadata before networking', async (t) => {
	const { directory, adapter } = await fixture(t, () => {
		assert.fail('Unexpected network call')
	})
	for (const url of [
		'http://updates.example.test/client.dmg',
		'https://user:secret@updates.example.test/client.dmg',
		`${artifact.url}?token=secret`,
		`${artifact.url}#fragment`,
		'https://updates.example.test/%2e%2e%2fclient.dmg',
		'https://updates.example.test/client%0a.dmg',
		'https://updates.example.test/client.exe',
		'https://updates.example.test/.hidden.dmg',
	]) {
		await assert.rejects(adapter.download({ ...artifact, url }, '2.4.0'))
	}
	for (const patch of [{ size: 0 }, { size: 2 ** 31 + 1 }, { size: 1.5 }, { sha256: 'bad' }, { arch: 'invalid' }, { signing: 'signed' }]) {
		await assert.rejects(adapter.download({ ...artifact, ...patch }, '2.4.0'))
	}
	assert.deepEqual(await fs.readdir(directory), [])
})

test('dispose cancels an active download and prevents subsequent downloads', async (t) => {
	let started
	const ready = new Promise((resolve) => {
		started = resolve
	})
	const { directory, adapter } = await fixture(t, () => {
		started()
		return new Promise(() => {})
	})
	const pending = adapter.download(artifact, '2.4.0')
	await ready
	adapter.dispose()
	await assert.rejects(pending)
	await assert.rejects(adapter.download(artifact, '2.4.0'))
	assert.deepEqual(await fs.readdir(directory), [])
})
