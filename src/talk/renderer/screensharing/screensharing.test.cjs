const { parse, compileScript } = require('@vue/compiler-sfc')
/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')
const vue = require('vue')

// Compile the actual SFC setup and template, using inert component/media hosts.
function mount(name, { capture, sources = async () => [], props = {} } = {}) {
	const file = path.join(__dirname, `${name}.vue`)
	const { descriptor } = parse(fs.readFileSync(file, 'utf8'), { filename: file })
	const compiled = compileScript(descriptor, { id: name, inlineTemplate: true })
	const code = ts.transpileModule(compiled.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
	const focus = vue.ref(true)
	const fallback = { setup: (_, { slots }) => () => vue.h('stub', {}, [slots.default?.(), slots.actions?.()]) }
	const dependencies = (id) => id === 'vue' ? vue : id === '@nextcloud/l10n' ? { t: (_, message) => message } : id === '@vueuse/core' ? { useWindowFocus: () => focus } : { __esModule: true, default: fallback }
	const output = { exports: {} }
	new Function('require', 'exports', 'window', 'navigator', code)(dependencies, output.exports, {
		systemInfo: { isMac: true, isWayland: false },
		TALK_DESKTOP: { getDesktopCapturerSources: sources },
	}, { mediaDevices: { getUserMedia: capture } })
	const node = (type, text = '') => vue.markRaw({ type, text, children: [], props: {}, style: {}, parent: null, play: async () => {} })
	const renderer = vue.createRenderer({
		createElement: node,
		createText: (text) => node('text', text),
		createComment: (text) => node('comment', text),
		setText: (el, text) => { el.text = text },
		setElementText: (el, text) => {
			el.text = text
			el.children = []
		},
		patchProp: (el, key, prev, next) => { el.props[key] = next },
		insert: (el, parent) => {
			el.parent = parent
			parent.children.push(el)
		},
		remove: (el) => { el.parent.children = el.parent.children.filter((child) => child !== el) },
		parentNode: (el) => el.parent,
		nextSibling: () => null,
	})
	const root = node('root')
	const emitted = []
	const app = renderer.createApp(output.exports.default, { ...props, onSubmit: (id) => emitted.push(id) })
	app.mount(root)
	const all = () => {
		const visit = (el) => [el, ...el.children.flatMap(visit)]
		return visit(root)
	}
	return { app, all, emitted, focus }
}
async function flush() {
	await new Promise((resolve) => setImmediate(resolve))
	await vue.nextTick()
}
const source = (id) => ({ id, name: id, icon: null, thumbnail: null })
const share = (fixture) => fixture.all().find((el) => el.props.label === 'Share screen')

test('refresh removes stale selection, prevents submitting during refresh and handles an empty list', async () => {
	let list = [source('window:1:0')]
	const fixture = mount('DesktopMediaSourceDialog', { sources: async () => list })
	await flush()
	share(fixture).props.onClick()
	assert.deepEqual(fixture.emitted, ['window:1:0'])
	list = [source('window:2:0')]
	fixture.focus.value = false
	await flush()
	share(fixture).props.onClick()
	assert.deepEqual(fixture.emitted, ['window:1:0', 'window:2:0'])
	list = []
	fixture.focus.value = true
	await flush()
	assert.equal(share(fixture).props.disabled, true)
	share(fixture).props.onClick()
	assert.equal(fixture.emitted.length, 2)
	fixture.app.unmount()
})

test('older source response cannot restore a disappeared window', async () => {
	let resolveOld
	let count = 0
	const fixture = mount('DesktopMediaSourceDialog', { sources: () => ++count === 1
		? new Promise((resolve) => {
				resolveOld = resolve
			})
		: Promise.resolve([]) })
	fixture.focus.value = false
	await flush()
	resolveOld([source('window:1:0')])
	await flush()
	assert.equal(share(fixture).props.disabled, true)
	fixture.app.unmount()
})

test('denied preview renders retry guidance instead of the loading icon', async () => {
	const fixture = mount('DesktopMediaSourcePreviewLive', { props: { mediaSourceId: 'window:1:0' }, capture: async () => {
		throw new Error('permission denied')
	} })
	await flush()
	const status = fixture.all().find((el) => el.props.role === 'status')
	assert.match(status.text, /off and on to retry/)
	assert.equal(fixture.all().some((el) => el.props.size === 40), false)
	fixture.app.unmount()
})

test('a late permission grant after unmount releases every acquired track', async () => {
	let grant
	let stopped = 0
	const fixture = mount('DesktopMediaSourcePreviewLive', { props: { mediaSourceId: 'window:1:0' }, capture: () => new Promise((resolve) => {
		grant = resolve
	}) })
	fixture.app.unmount()
	grant({ getTracks: () => [{ stop: () => stopped++ }, { stop: () => stopped++ }] })
	await flush()
	assert.equal(stopped, 2)
})

test('playback rejection releases capture and shows recoverable error', async () => {
	let stopped = 0
	const fixture = mount('DesktopMediaSourcePreviewLive', { props: { mediaSourceId: 'window:1:0' }, capture: async () => ({ getTracks: () => [{ stop: () => stopped++ }] }) })
	await flush()
	const video = fixture.all().find((el) => el.type === 'video')
	await video.props.onLoadedmetadata({ target: { play: async () => {
		throw new Error('playback failed')
	} } })
	await flush()
	assert.equal(stopped, 1)
	assert.ok(fixture.all().find((el) => el.props.role === 'status'))
	fixture.app.unmount()
	assert.equal(stopped, 1)
})

test('Share stays disabled until an in-flight refresh settles', async () => {
	let refresh
	let calls = 0
	const fixture = mount('DesktopMediaSourceDialog', { sources: () => ++calls === 1
		? Promise.resolve([source('window:1:0')])
		: new Promise((resolve) => {
				refresh = resolve
			}) })
	await flush()
	fixture.focus.value = false
	await flush()
	assert.equal(share(fixture).props.disabled, true)
	share(fixture).props.onClick()
	assert.deepEqual(fixture.emitted, [])
	refresh([source('window:1:0')])
	await flush()
	assert.equal(share(fixture).props.disabled, false)
	share(fixture).props.onClick()
	assert.deepEqual(fixture.emitted, ['window:1:0'])
	fixture.app.unmount()
})

test('toggling live preview off and on recovers after a failed attempt', async () => {
	let attempts = 0
	let stopped = 0
	const capture = async () => {
		if (++attempts === 1) {
			throw new Error('source unavailable')
		}
		return { getTracks: () => [{ stop: () => stopped++ }] }
	}
	const options = { props: { mediaSourceId: 'window:1:0' }, capture }
	const failed = mount('DesktopMediaSourcePreviewLive', options)
	await flush()
	assert.ok(failed.all().find((el) => el.props.role === 'status'))
	failed.app.unmount()
	const recovered = mount('DesktopMediaSourcePreviewLive', options)
	await flush()
	const video = recovered.all().find((el) => el.type === 'video')
	assert.ok(video.srcObject)
	await video.props.onLoadedmetadata({ target: video })
	await flush()
	assert.equal(recovered.all().some((el) => el.props.role === 'status' || el.props.size === 40), false)
	recovered.app.unmount()
	assert.equal(stopped, 1)
})
