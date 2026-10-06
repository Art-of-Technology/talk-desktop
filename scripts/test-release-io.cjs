/* SPDX-License-Identifier: AGPL-3.0-or-later */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createReleaseStorage, createManifestFetcher } = require('../src/app/DesktopReleaseIO.js')
const { createMandatoryShutdown } = require('../src/app/MandatoryUpdateShutdown.js')

test('release policy survives process-style reopen without partial or temporary state', () => {
	const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-state-'))
	try {
		const state = { policy: { version: '2.4.0', deadline: 10000 }, acknowledged: ['2.3.0'] }
		const storage = createReleaseStorage(directory)
		assert.equal(storage.read(), null)
		storage.write(state)
		assert.deepEqual(createReleaseStorage(directory).read(), state)
		storage.write({ ...state, acknowledged: ['2.3.0', '2.4.0'] })
		assert.deepEqual(fs.readdirSync(directory), ['desktop-release-state.json'])
		assert.throws(() => storage.write({ huge: 'a'.repeat(600000) }))
		assert.equal(storage.read().policy.deadline, 10000)
	} finally {
		assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()))
		assert.ok(path.basename(directory).startsWith('release-state-'))
		fs.rmSync(directory, { recursive: true, force: true })
	}
})

test('metadata fetch does not send credentials, follow redirects or cache the policy', async () => {
	let options
	const fetch = createManifestFetcher(async (_url, init) => {
		options = init
		return new Response(JSON.stringify({ schemaVersion: 1 }))
	})
	assert.deepEqual(await fetch('https://updates.example/stable/release-manifest.json'), { schemaVersion: 1 })
	assert.equal(options.redirect, 'error')
	assert.equal(options.credentials, 'omit')
	assert.equal(options.cache, 'no-store')
	await assert.rejects(fetch('http://updates.example/'))
	await assert.rejects(fetch('https://user:password@updates.example/'))
})

test('metadata is bounded even when the response omits content length', async () => {
	const fetch = createManifestFetcher(async () => new Response('a'.repeat(262145)))
	await assert.rejects(fetch('https://updates.example/'), /too large/)
})

test('failed and redirected metadata cannot be accepted', async () => {
	await assert.rejects(createManifestFetcher(async () => new Response('{}', { status: 503 }))('https://updates.example/'))
	const response = new Response('{}')
	Object.defineProperty(response, 'redirected', { value: true })
	await assert.rejects(createManifestFetcher(async () => response)('https://updates.example/'))
})

test('metadata timeout aborts a stalled request', async () => {
	const fetch = createManifestFetcher((_url, { signal }) => new Promise((_resolve, reject) => {
		signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
	}), 10)
	await assert.rejects(fetch('https://updates.example/'), /aborted/)
})

test('tray cleanup failure cannot prevent mandatory window shutdown', () => {
	const actions = []
	createMandatoryShutdown({
		app: { exit: () => actions.push('exit') },
		markQuitting: () => {},
		prepareQuit: () => { throw new Error('tray unavailable') },
		getWindows: () => [{ isDestroyed: () => false, destroy: () => actions.push('destroy') }],
	})()
	assert.deepEqual(actions, ['destroy', 'exit'])
})

test('mandatory shutdown stops only owned windows and cannot be vetoed by one failed close', () => {
	const actions = []
	const close = createMandatoryShutdown({
		app: { exit: (code) => actions.push(['exit', code]) },
		prepareQuit: () => actions.push('tray-quitting'),
		markQuitting: () => actions.push('quitting'),
		getWindows: () => [
			{ isDestroyed: () => false, destroy: () => {
				actions.push('call-media-stopped')
				throw new Error('closed')
			} },
			{ isDestroyed: () => false, destroy: () => actions.push('chat-closed') },
		],
	})
	close()
	close()
	assert.deepEqual(actions, ['quitting', 'tray-quitting', 'call-media-stopped', 'chat-closed', ['exit', 0]])
})
