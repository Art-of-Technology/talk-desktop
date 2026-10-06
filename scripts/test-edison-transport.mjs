import assert from 'node:assert/strict'
import test from 'node:test'
import { createDesktopTransport, relayUrl } from '../src/talk/renderer/EdisonActions/desktopTransport.js'

const promptId = 'abcdefgh12345678'
const context = { serverUrl: 'https://workspace.example/nextcloud', token: 'room1234', accountId: 'alice' }
const input = { context, promptId, endpoint: 'actions', body: { conversationToken: 'room1234', clickId: 'abcdefghijklmnopqrstuv', actionId: 'decline', userId: 'forged' } }

test('relay remains under account installation and accepts only fixed endpoint and identifier', () => {
	assert.equal(relayUrl(context.serverUrl, promptId, 'state'), `https://workspace.example/nextcloud/index.php/apps/edison_actions/api/desktop/prompts/${promptId}/state`)
	for (const server of ['http://workspace.example', 'https://user:pass@workspace.example', 'https://workspace.example/?redirect=evil', 'https://workspace.example/#bad']) {
		assert.throws(() => relayUrl(server, promptId, 'state'))
	}
	assert.throws(() => relayUrl(context.serverUrl, '../escape', 'state'))
	assert.throws(() => relayUrl(context.serverUrl, promptId, '//evil.example'))
})

test('sends once, excludes forged identity, cookies and auth handling from renderer transport', async () => {
	let calls = 0
	const post = createDesktopTransport({ fetchImpl: async (url, options) => {
		calls++
		assert.equal(options.redirect, 'error')
		assert.equal(options.credentials, 'omit')
		assert.equal(options.cache, 'no-store')
		assert.equal(options.headers.Authorization, undefined)
		assert.equal(JSON.parse(options.body).userId, undefined)
		assert.equal(options.method, 'POST')
		return { ok: true, status: 200, json: async () => ({ result: 'accepted' }) }
	} })
	assert.equal((await post(input)).status, 'ok')
	assert.equal(calls, 1)
})

test('timeout aborts and never retries an action', async () => {
	let calls = 0
	let signal
	const post = createDesktopTransport({ timeoutMs: 10, fetchImpl: async (_url, options) => {
		calls++
		signal = options.signal
		return new Promise(() => {})
	} })
	assert.equal((await post(input)).status, 'error')
	assert.equal(signal.aborted, true)
	assert.equal(calls, 1)
})

test('404 hides; bad status and malformed JSON fail without retry', async () => {
	for (const [response, expected] of [[{ status: 404 }, 'gone'], [{ status: 403 }, 'error'], [{ status: 200, ok: true, json: async () => {
		throw new Error('invalid')
	} }, 'error']]) {
		let calls = 0
		const post = createDesktopTransport({ fetchImpl: async () => {
			calls++
			return response
		} })
		assert.equal((await post(input)).status, expected)
		assert.equal(calls, 1)
	}
})

test('invalid body and already unmounted cards send nothing', async () => {
	let calls = 0
	const post = createDesktopTransport({ fetchImpl: async () => {
		calls++
		throw new Error('unexpected')
	} })
	assert.equal((await post({ ...input, body: { ...input.body, actionId: 'delete' } })).status, 'error')
	const controller = new AbortController()
	controller.abort()
	assert.equal((await post({ ...input, signal: controller.signal })).status, 'error')
	assert.equal(calls, 0)
})
