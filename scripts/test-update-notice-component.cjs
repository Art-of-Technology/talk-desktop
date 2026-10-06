const { parse, compileScript } = require('@vue/compiler-sfc')
/* SPDX-License-Identifier: AGPL-3.0-or-later */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const vue = require('vue')
const { UpdateNoticeState } = require('../src/talk/renderer/updates/UpdateNoticeState.js')

const componentPath = path.join(__dirname, '../src/talk/renderer/updates/UpdateNotice.vue')
const descriptor = parse(fs.readFileSync(componentPath, 'utf8')).descriptor
const script = compileScript(descriptor, { id: 'update-notice-test' }).content
const compiled = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText

/**
 * Execute the actual component setup with Vue reactivity and a fake native bridge.
 *
 * @param {() => Promise<boolean>} install Native restart implementation
 */
function setup(install = async () => true) {
	const scope = vue.effectScope()
	const call = vue.reactive({ hasCallWindow: false, isCallWindow: false })
	const props = vue.reactive({ state: { status: 'ready', version: '2.3.5' } })
	let installCalls = 0
	const cleanup = []
	const context = {
		setInterval: () => 1,
		clearInterval: () => {},
		document: { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} },
		exports: {},
		require: (name) => {
			if (name === 'vue') {
				return { ...vue, onBeforeUnmount: (callback) => cleanup.push(callback) }
			}
			if (name === '@nextcloud/l10n') {
				return { t: (_app, text) => text }
			}
			if (name.includes('callWindowState')) {
				return { callWindowState: call }
			}
			if (name.includes('UpdateNoticeState')) {
				return { UpdateNoticeState }
			}
			return {}
		},
		window: {
			localStorage: { getItem: () => null, setItem: () => {} },
			TALK_DESKTOP: { packageInfo: { version: '2.3.4' }, desktopUpdateNoticeShown: async () => {}, installDesktopUpdate: () => {
				installCalls++
				return install()
			} },
		},
	}
	vm.runInNewContext(compiled, context)
	const component = scope.run(() => context.exports.default.setup(props, { expose: () => {}, emit: () => {} }))
	const originalStop = scope.stop.bind(scope)
	scope.stop = () => {
		cleanup.forEach((callback) => callback())
		originalStop()
	}
	return { scope, props, call, component, bridge: context.window.TALK_DESKTOP, installCalls: () => installCalls }
}

test('opening and dismissing actual popup never requests installation', (t) => {
	const fixture = setup()
	t.after(() => fixture.scope.stop())
	assert.equal(fixture.component.visible.value, true)
	fixture.component.dismiss()
	fixture.component.open()
	assert.equal(fixture.installCalls(), 0)
})

test('actual Restart action invokes native bridge only once while pending', async (t) => {
	let finish
	const fixture = setup(() => new Promise((resolve) => {
		finish = resolve
	}))
	t.after(() => fixture.scope.stop())
	const pending = fixture.component.restart()
	await fixture.component.restart()
	assert.equal(fixture.installCalls(), 1)
	finish(true)
	await pending
})

test('actual Restart action is blocked during calls and before download', async (t) => {
	const fixture = setup()
	t.after(() => fixture.scope.stop())
	fixture.call.hasCallWindow = true
	await fixture.component.restart()
	fixture.call.hasCallWindow = false
	fixture.props.state = { status: 'downloading' }
	await fixture.component.restart()
	assert.equal(fixture.installCalls(), 0)
})

test('rejected native restart releases buttons and presents feedback', async (t) => {
	const fixture = setup(async () => false)
	t.after(() => fixture.scope.stop())
	await fixture.component.restart()
	assert.equal(fixture.component.restarting.value, false)
	assert.match(fixture.component.feedback.value, /Could not restart/)
})

test('a live call hides the popup and defers it until the call ends', async (t) => {
	const fixture = setup()
	t.after(() => fixture.scope.stop())
	fixture.call.hasCallWindow = true
	await vue.nextTick()
	assert.equal(fixture.component.visible.value, false)
	fixture.call.hasCallWindow = false
	await vue.nextTick()
	assert.equal(fixture.component.visible.value, true)
})

test('mandatory notice stays visible during a call and cannot be dismissed', async (t) => {
	const fixture = setup()
	t.after(() => fixture.scope.stop())
	fixture.props.state = { status: 'available', mandatory: true, deadline: Date.now() + 60000 }
	fixture.call.hasCallWindow = true
	await vue.nextTick()
	assert.equal(fixture.component.visible.value, true)
	fixture.component.dismiss()
	assert.equal(fixture.component.visible.value, true)
	fixture.call.isCallWindow = true
	await vue.nextTick()
	assert.equal(fixture.component.visible.value, false)
})

test('optional offer does not download until consent and double clicks are coalesced', async (t) => {
	const fixture = setup()
	t.after(() => fixture.scope.stop())
	let downloads = 0
	let finish
	fixture.bridge.downloadDesktopUpdate = () => {
		downloads++
		return new Promise((resolve) => {
			finish = resolve
		})
	}
	fixture.props.state = { status: 'available', release: { version: '2.3.6', summary: ['Benefit'] } }
	await vue.nextTick()
	fixture.component.dismiss()
	fixture.component.open()
	assert.equal(downloads, 0)
	const pending = fixture.component.download()
	await fixture.component.download()
	assert.equal(downloads, 1)
	finish()
	await pending
})

test('installed notes acknowledge only explicitly, and can reopen without a fresh update check', async (t) => {
	const fixture = setup()
	t.after(() => fixture.scope.stop())
	let acknowledged
	fixture.bridge.acknowledgeDesktopRelease = async (version) => {
		acknowledged = version
		return true
	}
	fixture.component.dismiss()
	fixture.props.state = { status: 'idle', whatsNew: { version: '2.3.4', title: 'Installed', summary: [], sections: [] } }
	await vue.nextTick()
	assert.equal(fixture.component.notesVisible.value, true)
	assert.equal(acknowledged, undefined)
	await fixture.component.dismissNotes()
	assert.equal(acknowledged, '2.3.4')
	assert.equal(fixture.component.notesVisible.value, false)
	assert.equal(fixture.component.openNotes(), true)
})

test('notes for a different installed version are never shown', async (t) => {
	const fixture = setup()
	t.after(() => fixture.scope.stop())
	fixture.component.dismiss()
	fixture.props.state = { status: 'idle', whatsNew: { version: '9.0.0' } }
	await vue.nextTick()
	assert.equal(fixture.component.notesVisible.value, false)
})

test('failed acknowledgement retains installed notes and allows retry', async (t) => {
	const fixture = setup()
	t.after(() => fixture.scope.stop())
	fixture.component.dismiss()
	fixture.props.state = { status: 'idle', whatsNew: { version: '2.3.4', title: 'Installed', summary: [], sections: [] } }
	fixture.bridge.acknowledgeDesktopRelease = async () => false
	await vue.nextTick()
	await fixture.component.dismissNotes()
	assert.equal(fixture.component.notesVisible.value, true)
	assert.equal(fixture.component.acknowledging.value, false)
	assert.match(fixture.component.feedback.value, /Could not save your acknowledgement/)
	fixture.bridge.acknowledgeDesktopRelease = async () => true
	await fixture.component.dismissNotes()
	assert.equal(fixture.component.notesVisible.value, false)
})
