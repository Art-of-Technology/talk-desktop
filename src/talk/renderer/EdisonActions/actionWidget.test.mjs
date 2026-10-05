/* SPDX-License-Identifier: AGPL-3.0-or-later */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createActionWidget } from './actionWidget.js'

class Node {
	constructor(tag) {
		this.tag = tag
		this.children = []
		this.style = {}
		this.events = {}
		this.attributes = {}
	}

	set textContent(value) {
		this.text = value
		this.children = []
	}

	get textContent() {
		return (this.text || '') + this.children.map((n) => n.textContent).join('')
	}

	set innerHTML(value) {
		throw new Error('Unsafe HTML: ' + value)
	}

	appendChild(child) {
		this.children.push(child)
	}

	setAttribute(key, value) {
		this.attributes[key] = value
	}

	addEventListener(event, callback) {
		this.events[event] = callback
	}

	closest() {
		return null
	}

	contains(node) {
		return this === node || this.children.some((n) => n.contains(node))
	}

	find(tag) {
		return this.children.flatMap((n) => [...(n.tag === tag ? [n] : []), ...n.find(tag)])
	}
}
const pending = () => ({ state: 'pending', title: '<script>unsafe</script>', lines: ['<img src=x>'], actions: [{ id: 'approve', label: 'Evet', allowed: true }, { id: 'decline', label: 'Hayır', allowed: true }] })
const tick = () => new Promise((resolve) => setImmediate(resolve))
function defer() {
	let resolve
	const promise = new Promise((r) => {
		resolve = r
	})
	return { promise, resolve }
}
function fixture(handler, confirmation = async () => true, promptId = 'abcdefghijklmnop') {
	let context = { serverUrl: 'https://server.example', accountId: 'one', token: 'room' }

	let poll

	let clears = 0

	const calls = []

	const host = new Node('host')

	const widget = createActionWidget({
		getContext: () => context,
		post: async (request) => {
			calls.push(request)
			return handler ? handler(request) : { status: 'ok', body: pending() }
		},
		confirm: confirmation,
		document: { createElement: (tag) => new Node(tag) },
		setInterval: (callback) => {
			poll = callback
			return 1
		},
		clearInterval: () => {
			clears++
		},
	})

	widget.callback(host, { richObject: { promptId } })

	return { host, widget, calls, poll: () => poll(), switchAccount: () => {
		context = { ...context, accountId: 'two' }
		widget.invalidateContexts()
	}, cleared: () => clears }
}

test('safe text rendering and disabled actions cannot dispatch even through stale callbacks', async () => {
	const f = fixture(() => {
		const state = pending()
		state.actions[0].allowed = false
		return { status: 'ok', body: state }
	})

	await tick()

	assert.match(f.host.textContent, /<script>unsafe<\/script>/)

	const button = f.host.find('button')[0]

	assert.equal(button.disabled, true)

	button.events.click()

	await tick()

	assert.equal(f.calls.length, 1)
})

test('confirmation is required, duplicate clicks dispatch once with random 128-bit identifier', async () => {
	const confirmation = defer()

	const response = defer()

	const f = fixture((r) => r.endpoint === 'actions' ? response.promise : { status: 'ok', body: pending() }, () => confirmation.promise)

	await tick()

	const button = f.host.find('button')[0]

	button.events.click()
	button.events.click()

	assert.equal(f.calls.length, 1)

	confirmation.resolve(true)

	await tick()

	assert.equal(f.calls.filter((c) => c.endpoint === 'actions').length, 1)

	assert.match(f.calls[1].body.clickId, /^[A-Za-z0-9_-]{22}$/)

	assert.deepEqual(Object.keys(f.calls[1].body).sort(), ['actionId', 'clickId', 'conversationToken'])

	response.resolve({ status: 'ok', body: { result: 'accepted', message: 'Only you see this' } })

	await tick()

	assert.match(f.host.textContent, /Only you see this/)

	assert.equal(f.calls[2].endpoint, 'state')
})

test('decline does not need confirmation; failed actions re-read and never retry', async () => {
	const f = fixture((r) => r.endpoint === 'actions' ? Promise.reject(new Error('timeout')) : { status: 'ok', body: pending() }, () => {
		throw new Error('must not confirm decline')
	})

	await tick()

	f.host.find('button')[1].events.click()

	await tick()

	f.poll()
	await tick()

	assert.equal(f.calls.filter((r) => r.endpoint === 'actions').length, 1)

	assert.match(f.host.textContent, /Edison'a ulaşılamadı/)
})

test('a failed state refresh disables previously available controls', async () => {
	let failed = false

	const f = fixture(() => failed ? { status: 'error' } : { status: 'ok', body: pending() })

	await tick()

	const old = f.host.find('button')[1]

	failed = true
	f.poll()
	await tick()

	assert.ok(f.host.find('button').every((b) => b.disabled))

	old.events.click()
	await tick()

	assert.equal(f.calls.filter((r) => r.endpoint === 'actions').length, 0)
})

test('state polling cannot overlap; unmount aborts and suppresses pending response', async () => {
	const response = defer()

	const f = fixture(() => response.promise)

	f.poll()
	f.poll()

	assert.equal(f.calls.length, 1)

	f.widget.onDestroy(f.host)

	assert.equal(f.calls[0].signal.aborted, true)

	response.resolve({ status: 'ok', body: pending() })
	await tick()

	assert.equal(f.host.textContent, '')

	assert.ok(f.cleared() > 0)
})

test('account changes invalidate confirmation and do not send an action', async () => {
	const confirmation = defer()

	const f = fixture(undefined, () => confirmation.promise)

	await tick()

	f.host.find('button')[0].events.click()

	f.switchAccount()

	confirmation.resolve(true)
	await tick()

	assert.equal(f.calls.length, 1)

	assert.equal(f.host.style.display, 'none')
})

test('404 hides the card and stops polling', async () => {
	const f = fixture(() => ({ status: 'gone' }))

	await tick()

	f.poll()
	await tick()

	assert.equal(f.calls.length, 1)

	assert.equal(f.host.style.display, 'none')
})

test('malformed references make no network request and malformed state exposes no buttons', async () => {
	const invalid = fixture(undefined, undefined, '../bad')

	await tick()
	assert.equal(invalid.calls.length, 0)

	const f = fixture(() => ({ status: 'ok', body: { ...pending(), actions: [{ id: 'destroy', allowed: true, label: 'bad' }] } }))

	await tick()

	assert.equal(f.host.find('button').length, 0)

	assert.match(f.host.textContent, /Edison'a ulaşılamadı/)
})

test('cancelled confirmation never sends an action and private feedback is instance-local', async () => {
	const f = fixture(undefined, async () => false)

	const other = fixture()

	await tick()

	f.host.find('button')[0].events.click()
	await tick()

	assert.equal(f.calls.filter((r) => r.endpoint === 'actions').length, 0)

	assert.equal(other.calls.length, 1)
})

test('retry and manual require confirmation and resolved state converges without leaking feedback', async () => {
	for (const actionId of ['retry', 'manual']) {
		let resolved = false

		let confirmations = 0

		const state = () => ({ ...pending(), state: resolved ? 'resolved' : 'pending', actions: [{ id: actionId, label: actionId, allowed: true }] })

		const handler = (r) => {
			if (r.endpoint === 'actions') {
				resolved = true

				return { status: 'ok', body: { result: 'accepted', message: 'Private result' } }
			}

			return { status: 'ok', body: state() }
		}

		const clicker = fixture(handler, async () => {
			confirmations++
			return true
		})

		const observer = fixture(handler)

		await tick()

		clicker.host.find('button')[0].events.click()
		await tick()

		observer.poll()
		await tick()

		assert.equal(confirmations, 1)

		assert.match(clicker.host.textContent, /Private result/)

		assert.doesNotMatch(observer.host.textContent, /Private result/)

		assert.match(observer.host.textContent, /Sonuçlandı/)

		assert.equal(observer.host.find('button').length, 0)
	}
})

test('account switch aborts an in-flight state read and ignores its response', async () => {
	const response = defer()

	const f = fixture(() => response.promise)

	f.switchAccount()

	assert.equal(f.calls[0].signal.aborted, true)

	response.resolve({ status: 'ok', body: pending() })
	await tick()

	assert.equal(f.host.textContent, '')

	assert.equal(f.host.style.display, 'none')
})
