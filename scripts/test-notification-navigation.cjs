/* SPDX-License-Identifier: AGPL-3.0-or-later */
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const { resolveTalkPath } = require('../build/resolveBuildConfig.js')
const { NotificationNavigation } = require('../src/talk/NotificationNavigation.js')

/**
 *
 */
function fixture() {
	const makeWindow = () => {
		const contents = new EventEmitter()
		contents.mainFrame = {}
		contents.sent = []
		contents.send = (...args) => contents.sent.push(args)
		return { webContents: contents, isDestroyed: () => false }
	}
	let main = makeWindow()
	const original = main
	let owner
	let account = 'first'
	let allowed = true
	const event = (window) => ({ sender: window.webContents, senderFrame: window.webContents.mainFrame })
	const navigation = new NotificationNavigation({
		getMain: () => main,
		focusMain: () => { main ??= makeWindow() },
		trusted: (e) => allowed && e.senderFrame === e.sender.mainFrame && (e.sender === main?.webContents || e.sender === owner?.webContents),
		serverUrl: () => 'https://example.test',
		account: () => account,
	})
	return {
		navigation,
		original,
		event,
		get main() { return main },
		promote() {
			owner = main
			main = makeWindow()
		},
		closeMain() { main = undefined },
		switchAccount() { account = 'other' },
		logout() {
			allowed = false
			navigation.clear()
		},
	}
}

test('queues for replacement router readiness, preserves message route and recreates missing chat', () => {
	const f = fixture()
	f.navigation.markReady(f.event(f.original))
	f.promote()
	f.closeMain()
	assert.equal(f.navigation.open(f.event(f.original), 'https://example.test/index.php/call/room?messageId=42#message_42'), true)
	assert.equal(f.original.webContents.sent.length, 0)
	assert.equal(f.main.webContents.sent.length, 0)
	assert.equal(f.navigation.markReady(f.event(f.original)), false)
	f.navigation.markReady(f.event(f.main))
	assert.deepEqual(f.main.webContents.sent, [['talk:notification-route', '/call/room?messageId=42#message_42']])
	f.navigation.markReady(f.event(f.main))
	assert.equal(f.main.webContents.sent.length, 1)
})

test('rejects unknown/subframe senders, foreign and invalid routes', () => {
	const f = fixture()
	const event = f.event(f.main)
	assert.equal(f.navigation.open({ ...event, senderFrame: {} }, '/call/room'), false)
	assert.equal(f.navigation.open({ sender: { mainFrame: {} }, senderFrame: {} }, '/call/room'), false)
	for (const link of ['https://other.test/call/room', 'javascript:alert(1)', 'https://u:p@example.test/call/room', '/call/../settings', '/call/room/extra', '/apps/files', '/call/%2e%2e', undefined]) {
		assert.equal(f.navigation.open(event, link), false)
	}
	assert.equal(f.main.webContents.sent.length, 0)
})

test('account change, logout and target promotion discard queued clicks', () => {
	for (const invalidate of [(f) => f.switchAccount(), (f) => f.logout(), (f) => f.promote()]) {
		const f = fixture()
		f.navigation.open(f.event(f.main), '/call/room')
		invalidate(f)
		f.navigation.markReady(f.event(f.main))
		assert.equal(f.main.webContents.sent.length, 0)
		assert.equal(f.original.webContents.sent.length, 0)
	}
})

test('full document reload waits for router again; in-page routing retains readiness', () => {
	const f = fixture()
	const event = f.event(f.main)
	f.navigation.markReady(event)
	f.main.webContents.emit('did-start-navigation', {}, 'file:///app', false, true)
	f.navigation.open(event, '/call/first')
	assert.equal(f.main.webContents.sent.length, 0)
	f.navigation.markReady(event)
	f.main.webContents.emit('did-start-navigation', {}, '#/call/first', true, true)
	f.navigation.open(event, '/call/second')
	assert.equal(f.main.webContents.sent.length, 2)
})

test('actual normal and missed-call notification callbacks never route a promoted renderer', async () => {
	const f = fixture()
	const clicks = []
	const localRoutes = []
	const events = {}
	let missed
	const state = { isCallWindow: false, hasCallWindow: false }
	const context = vm.createContext({
		console,
		encodeURIComponent,
		callWindowState: state,
		isTestNotificationApp: () => false,
		checkCurrentUserHasPendingCall: async () => false,
		getAppConfigValue: () => 'never',
		userStatusStore: {},
		playSound: () => {},
		appData: { serverUrl: 'https://example.test', userMetadata: { locale: 'en' } },
		Notification: class { addEventListener(_name, callback) { clicks.push(callback) } },
		window: { TALK_DESKTOP: { openNotificationConversation: (link) => f.navigation.open(f.event(f.original), link) } },
		emit: (name, event) => events[name]?.(event),
		subscribe: (name, callback) => { events[name] = callback },
		unsubscribe: () => {},
		onBeforeUnmount: () => {},
		useRouter: () => ({ push: async (route) => localRoutes.push(route) }),
		useStore: () => ({}),
		useFederationStore: () => ({}),
		subscribeBroadcast: (_name, callback) => { missed = callback },
		t: () => 'Missed call',
	})
	// Execute the pinned Talk interceptor too: a local notification event would navigate it.
	const upstream = fs.readFileSync(path.join(resolveTalkPath(), 'src/composables/useInterceptNotifications.ts'), 'utf8').replace(/^import .*\n/gm, '').replace('export function', 'function')
	vm.runInContext(ts.transpileModule(upstream, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
	vm.runInContext('useInterceptNotifications()', context)
	const source = fs.readFileSync(path.join(__dirname, '../src/talk/renderer/notifications/notifications.store.js'), 'utf8')
	const start = source.indexOf('\tasync function showNativeNotification(')
	assert.ok(start >= 0)
	vm.runInContext(source.slice(start, source.indexOf('\n\t/**', start)), context)
	vm.runInContext(source.slice(source.indexOf("subscribeBroadcast('notifications:missedCall'")), context)
	await vm.runInContext("showNativeNotification({ app: 'spreed', objectType: 'chat', subject: 'Test', link: 'https://example.test/call/chat?messageId=7#message_7' })", context)
	missed({ token: 'missed-room', name: 'Test', type: 'one2one' })
	f.promote()
	state.isCallWindow = true
	f.navigation.markReady(f.event(f.main))
	for (const click of clicks) {
		await click()
	}
	assert.deepEqual(localRoutes, [])
	assert.equal(f.original.webContents.sent.length, 0)
	assert.deepEqual(f.main.webContents.sent, [
		['talk:notification-route', '/call/chat?messageId=7#message_7'],
		['talk:notification-route', '/call/missed-room'],
	])
})

test('actual mounted chat receiver pushes the forwarded route as data', () => {
	let receive
	const routes = []
	const context = vm.createContext({
		window: {
			TALK_DESKTOP: { onNotificationConversation: (callback) => { receive = callback } },
			OCA: { Talk: { instance: { $router: { push: async (route) => routes.push(route) } } } },
		},
	})
	const source = fs.readFileSync(path.join(__dirname, '../src/talk/renderer/TalkWrapper/talk.service.ts'), 'utf8')
		.replace(/^import .*\n/gm, '').replace(/export /g, '')
	vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
	vm.runInContext('registerNotificationNavigation()', context)
	const route = '/call/room?messageId=8#message_8'
	receive(route)
	assert.deepEqual(routes, [route])
})
