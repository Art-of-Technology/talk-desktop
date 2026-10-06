import assert from 'node:assert/strict'
import fs from 'node:fs'
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'

const source = fs.readFileSync(new URL('./cardWidget.js', import.meta.url), 'utf8')

const { cardUrl, createCardTransport, createCardWidget } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))

const id = 'a'.repeat(32)

test('account base URL preserved and untrusted ids/URLs refused', () => {
	assert.equal(cardUrl('https://chat.example/sub/index.php', id), 'https://chat.example/sub/index.php/apps/workspace_integrations/api/cards/' + id)

	for (
		const url
		of ['file:///local', 'https://user:pass@chat.example', 'https://chat.example?x=1']) {
		assert.throws(() => cardUrl(url, id))
	}

	assert.throws(() => cardUrl('https://chat.example', '../secret'))
})

test('read-only account interceptor transport; no caller identity or tokens', async () => {
	let call

	const request = createCardTransport({ fetchImpl: async (...args) => {
		call = args

		return { ok: true, json: async () => ({ schemaVersion: 1, blocks: [] }) }
	}})

	const result = await request({ context: { serverUrl: 'https://chat.example' }, cardId: id })

	assert.equal(result.status, 'ok')

	assert.equal(call[1].method, 'GET')

	assert.equal(call[1].redirect, 'error')

	assert.equal(call[1].cache, 'no-store')

	assert.equal(call[1].credentials, 'omit')

	assert.deepEqual(Object.keys(call[1].headers), ['Accept'])
})

test('404, failure and timeout have bounded explicit outcomes', async () => {
	for (
		const [status, expected]
		of [[404, 'gone'], [403, 'error']]) {
		const request = createCardTransport({ fetchImpl: async () => ({ status, ok: false }) })

		assert.equal((await request({ context: { serverUrl: 'https://chat.example' }, cardId: id })).status, expected)
	}

	let aborted = false

	const request = createCardTransport({ timeoutMs: 10, fetchImpl: async (_url, opts) => {
		opts.signal.addEventListener('abort', () => {
			aborted = true
		})

		return new Promise(() => {})
	}})

	assert.equal((await request({ context: { serverUrl: 'https://chat.example' }, cardId: id })).status, 'error')

	assert(aborted)
})

class Node {
	constructor() {
		this.children = []

		this.textContent = ''
	}

	appendChild(n) {
		this.children.push(n)
	}

	replaceChildren(...n) {
		this.children = n

		this.textContent = ''
	}

	contains(n) {
		return this.children.includes(n)
	}
}

test('unmount and account switches discard in-flight private payload', async () => {
	let context = { serverUrl: 'https://chat.example', accountId: 'alice', token: 'room1234' }, resolve, rendered = 0

	const widget = createCardWidget({ getContext: () => context, document: { createElement: () => new Node() }, request: () => new Promise((r) => {
		resolve = r
	}), render: () => {
		rendered++

		return new Node()
	}})

	const host = new Node()

	widget.callback(host, { richObject: { cardId: id } })

	context = { ...context, accountId: 'bob' }

	widget.invalidateContexts()

	resolve({ status: 'ok', body: {} })

	await new Promise((r) => setImmediate(r))

	assert.equal(rendered, 0)

	assert.equal(host.children[0].textContent, '')

	widget.callback(host, { richObject: { cardId: id } })

	widget.onDestroy(host)

	resolve({ status: 'ok', body: {} })

	await new Promise((r) => setImmediate(r))

	assert.equal(rendered, 0)
})

test('initial missing receipt retries invisibly then renders', async () => {
	let calls = 0, rendered = 0

	const context = { serverUrl: 'https://chat.example', accountId: 'alice', token: 'room1234' }

	const widget = createCardWidget({ getContext: () => context, document: { createElement: () => new Node() }, retryDelays: [1, 1], request: async () => ++calls < 3 ? { status: 'gone' } : { status: 'ok', body: {} }, render: () => {
		rendered++

		return new Node()
	}})

	const host = new Node()

	widget.callback(host, { richObject: { cardId: id } })

	await until(() => rendered === 1)

	assert.equal(calls, 3)

	assert.equal(host.children[0].textContent, '')

	widget.onDestroy(host)
})

test('mounted refresh removes revoked access without missing-card retries', async () => {
	let calls = 0, rendered = 0

	const context = { serverUrl: 'https://chat.example', accountId: 'alice', token: 'room1234' }

	const widget = createCardWidget({ getContext: () => context, document: { createElement: () => new Node() }, refreshMs: 5, retryDelays: [1, 1], request: async () => ++calls === 1 ? { status: 'ok', body: {} } : { status: 'gone' }, render: () => {
		rendered++

		return new Node()
	}})

	const host = new Node()

	widget.callback(host, { richObject: { cardId: id } })

	await until(() => calls === 2)

	assert.equal(rendered, 1)

	assert.equal(host.children[0].children.length, 0)

	await new Promise((r) => setTimeout(r, 20))

	assert.equal(calls, 2)

	widget.onDestroy(host)
})

test('refresh keeps immutable DOM, failure clears data, unmount cancels next refresh', async () => {
	let calls = 0, rendered = 0

	const context = { serverUrl: 'https://chat.example', accountId: 'alice', token: 'room1234' }

	const widget = createCardWidget({ getContext: () => context, document: { createElement: () => new Node() }, refreshMs: 5, request: async () => ++calls < 3 ? { status: 'ok', body: {} } : { status: 'error' }, render: () => {
		rendered++

		return new Node()
	}})

	const host = new Node()

	widget.callback(host, { richObject: { cardId: id } })

	await until(() => calls === 3)

	assert.equal(rendered, 1)

	assert.equal(host.children[0].children.length, 0)

	assert.match(host.children[0].textContent, /unavailable/)

	widget.onDestroy(host)

	await new Promise((r) => setTimeout(r, 20))

	assert.equal(calls, 3)
})

test('unmount during initial missing-card retry stops later reads', async () => {
	let calls = 0

	const context = { serverUrl: 'https://chat.example', accountId: 'alice', token: 'room1234' }

	const widget = createCardWidget({ getContext: () => context, document: { createElement: () => new Node() }, retryDelays: [100], request: async () => {
		calls++

		return { status: 'gone' }
	}, render: () => new Node() })

	const host = new Node()

	widget.callback(host, { richObject: { cardId: id } })

	await new Promise((r) => setImmediate(r))

	widget.onDestroy(host)

	await new Promise((r) => setTimeout(r, 120))

	assert.equal(calls, 1)
})

async function until(condition) {
	const deadline = Date.now() + 1000

	while (!condition()) {
		if (Date.now() > deadline) {
			throw new Error('Timed out waiting for widget')
		}

		await new Promise((r) => setTimeout(r, 1))
	}
}

test('vendored renderer and stylesheet match recorded SHA-256 provenance', async () => {
	const { createHash } = await import('node:crypto')

	const provenance = JSON.parse(fs.readFileSync(new URL('./vendor/provenance.json', import.meta.url), 'utf8'))

	for (
		const file
		of provenance.files) {
		assert.equal(createHash('sha256').update(fs.readFileSync(new URL('./vendor/' + file.file, import.meta.url))).digest('hex'), file.sha256)
	}
})
