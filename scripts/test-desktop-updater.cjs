/* SPDX-License-Identifier: AGPL-3.0-or-later */
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { test } = require('node:test')
const { DesktopUpdater } = require('../src/app/DesktopUpdater.js')
const { validateManifest } = require('../src/app/ReleaseManifest.js')
const release = (version, mandatory = false) => ({ version, mandatory, graceMinutes: 15, title: 'Changes', summary: ['New capability'], sections: [{ heading: 'Details', body: 'Plain text', images: [] }] })
const manifest = (...releases) => ({ schemaVersion: 1, latestVersion: releases.at(-1).version, releases })
/**
 *
 * @param {object} options Fixture overrides
 */
function setup(options = {}) {
	const native = new EventEmitter()

	const calls = []

	native.setFeedURL = (value) => calls.push(['feed', value])

	native.checkForUpdates = () => calls.push(['check'])

	native.quitAndInstall = () => calls.push(['install'])

	let saved

	let time = 100000

	const storage = { read: () => saved, write: (data) => {
		saved = structuredClone(data)
	} }

	const updater = new DesktopUpdater({ autoUpdater: native, feedUrl: 'https://updates.example/windows/x64/', supported: true, installedVersion: '2.3.5', fetchManifest: async () => manifest(release('2.3.5'), release('2.3.6')), storage, now: () => time, ...options })

	return { native, updater, calls, storage, advance: (duration) => {
		time += duration
	} }
}
test('discovery and skipping never invoke native download, installation or feed initialization', async () => {
	const { updater, calls } = setup()

	assert.equal((await updater.check()).status, 'available')

	assert.deepEqual(calls, [])

	assert.equal(updater.install({ canInstall: () => true, prepareQuit: () => assert.fail() }), false)

	await updater.check()

	assert.deepEqual(calls, [])
})
test('consent pins exact feed, concurrent clicks and checks do not replace accepted release', async () => {
	const { updater, calls, native } = setup()

	await updater.check()

	updater.download()

	updater.download()

	await updater.check()

	assert.deepEqual(calls, [['feed', { url: 'https://updates.example/windows/x64/releases/2.3.6/' }], ['check']])

	native.emit('update-downloaded', {}, '', '2.3.6')

	assert.equal(updater.getState().status, 'ready')

	assert.equal(updater.install({ canInstall: () => false, prepareQuit: () => assert.fail() }), false)

	assert.equal(updater.install({ canInstall: () => true, prepareQuit: () => {} }), true)

	assert.equal(updater.install({ canInstall: () => true, prepareQuit: () => assert.fail() }), false)
})
test('mismatching downloaded version never becomes installable', async () => {
	const { updater, native } = setup()

	await updater.check()

	updater.download()

	native.emit('update-downloaded', {}, '', '9.9.9')

	assert.equal(updater.getState().status, 'error')

	assert.equal(updater.install({ canInstall: () => true, prepareQuit: () => assert.fail() }), false)
})
test('mandatory deadline begins on displayed notice, survives offline restart and expires once', async () => {
	let expired = 0

	const fixture = setup({ fetchManifest: async () => manifest(release('2.3.6', true)), onMandatoryExpired: () => {
		expired++
	} })

	await fixture.updater.check()

	assert.equal(fixture.updater.getState().deadline, undefined)

	fixture.updater.noticeShown()

	const deadline = fixture.updater.getState().deadline

	fixture.advance(60000)

	fixture.updater.noticeShown()

	assert.equal(fixture.updater.getState().deadline, deadline)

	const restarted = setup({ storage: fixture.storage, now: () => deadline + 1, fetchManifest: async () => {
		throw new Error('secret')
	}, onMandatoryExpired: () => {
		expired++
	} })

	await restarted.updater.check()

	restarted.updater.tick()

	restarted.updater.tick()

	assert.equal(restarted.updater.getState().deadline, deadline)

	assert.equal(expired, 1)

	assert.ok(!JSON.stringify(restarted.updater.getState()).includes('secret'))
})
test('new optional release preserves required-version clock; valid withdrawal clears it', async () => {
	let data = manifest(release('2.3.6', true))

	const { updater } = setup({ fetchManifest: async () => data })

	await updater.check()

	updater.noticeShown()

	const deadline = updater.getState().deadline

	data = manifest(release('2.3.6', true), release('2.3.7'))

	await updater.check()

	assert.equal(updater.getState().deadline, deadline)

	assert.equal(updater.getState().version, '2.3.7')

	data = manifest(release('2.3.6'), release('2.3.7'))

	await updater.check()

	assert.equal(updater.getState().mandatory, false)
})
test('notes are exact installed version, explicitly acknowledged, durable and still reopenable', async () => {
	const { updater, storage } = setup()

	await updater.check()

	assert.equal(updater.getState().whatsNew.version, '2.3.5')

	assert.equal(updater.acknowledgeNotes('2.3.6'), false)

	assert.equal(updater.acknowledgeNotes('2.3.5'), true)

	const restarted = setup({ storage }).updater

	assert.equal(restarted.getState().whatsNew, undefined)

	assert.equal(restarted.getState().currentRelease.version, '2.3.5')
})
test('malformed metadata cannot create policy or erase existing deadline', async () => {
	let data = manifest(release('2.3.6', true))

	const { updater } = setup({ fetchManifest: async () => data })

	await updater.check()

	updater.noticeShown()

	const deadline = updater.getState().deadline

	data = { ...data, latestVersion: '../bad' }

	await updater.check()

	assert.equal(updater.getState().deadline, deadline)

	assert.equal(updater.getState().status, 'error')
})
test('persist failure cannot claim a durable acknowledgement or reset mandatory timer', async () => {
	const { updater } = setup({ fetchManifest: async () => manifest(release('2.3.5'), release('2.3.6', true)), storage: { read: () => null, write: () => {
		throw new Error('disk')
	} } })

	await updater.check()

	updater.noticeShown()

	const deadline = updater.getState().deadline
	assert.ok(Number.isInteger(deadline))
	updater.noticeShown()
	assert.equal(updater.getState().deadline, deadline)

	assert.equal(updater.acknowledgeNotes('2.3.5'), false)

	assert.ok(updater.getState().whatsNew)
})
test('state is deeply isolated; disposing removes native listeners', async () => {
	const { updater, native } = setup()

	await updater.check()

	updater.getState().release.summary[0] = 'changed'

	assert.equal(updater.getState().release.summary[0], 'New capability')

	updater.dispose()

	assert.equal(native.eventNames().length, 0)
})
for (const feedUrl of [null, 'http://updates.example/', 'https://user:pass@updates.example/', 'https://updates.example/?token=secret']) {
	test(`invalid or missing feed never invokes native API: ${feedUrl}`, async () => {
		const { updater, calls } = setup({ feedUrl })

		await updater.check()

		updater.download()

		assert.deepEqual(calls, [])
	})
}
for (const imageUrl of ['https://evil.example/image.png', 'http://updates.example/windows/x64/a.png', 'https://updates.example/elsewhere/a.png', 'https://updates.example/windows/x64/%2fsecret.png']) {
	test(`reject unsafe screenshot ${imageUrl}`, () => {
		const data = manifest(release('2.3.6'))

		data.releases[0].sections[0].images = [{ url: imageUrl, alt: 'Screenshot' }]

		assert.throws(() => validateManifest(data, 'https://updates.example/windows/x64/'))
	})
}
test('reject duplicate releases, oversized notes and missing latest', () => {
	assert.throws(() => validateManifest(manifest(release('2.3.6'), release('2.3.6')), 'https://updates.example/'))

	const data = manifest(release('2.3.6'))

	data.releases[0].summary = ['x'.repeat(501)]

	assert.throws(() => validateManifest(data, 'https://updates.example/'))

	assert.throws(() => validateManifest({ ...data, latestVersion: '2.3.7' }, 'https://updates.example/'))
})

test('metadata refresh while native download or staged update preserves consent and applies withdrawal', async () => {
	let data = manifest(release('2.3.6', true))
	const { updater, native, calls } = setup({ fetchManifest: async () => data })
	await updater.check()
	updater.noticeShown()
	updater.download()
	data = manifest(release('2.3.6'), release('2.3.7'))
	await updater.check()
	assert.equal(updater.getState().status, 'downloading')
	assert.equal(updater.getState().version, '2.3.6')
	assert.equal(updater.getState().mandatory, false)
	native.emit('update-downloaded', {}, '', '2.3.6')
	data = manifest(release('2.3.6'), release('2.3.7', true))
	await updater.check()
	assert.equal(updater.getState().status, 'ready')
	assert.equal(updater.getState().mandatory, true)
	assert.equal(updater.getState().version, '2.3.6')
	assert.equal(calls.filter(([name]) => name === 'check').length, 1)
})

test('native errors sanitized and stale events cannot erase ready state', async () => {
	const { updater, native } = setup()
	await updater.check()
	updater.download()
	native.emit('error', new Error('private-native-details'))
	assert.equal(updater.getState().status, 'error')
	assert.ok(!JSON.stringify(updater.getState()).includes('private-native-details'))
	updater.download()
	native.emit('update-downloaded', {}, '', '2.3.6')
	native.emit('error', new Error('late failure'))
	assert.equal(updater.getState().status, 'ready')
})

test('unsupported client never invokes updater and absent installed notes never use latest notes', async () => {
	const unsupported = setup({ supported: false })
	assert.equal((await unsupported.updater.check()).status, 'unsupported')
	unsupported.updater.download()
	assert.deepEqual(unsupported.calls, [])
	const { updater } = setup({ fetchManifest: async () => manifest(release('2.3.6')) })
	await updater.check()
	assert.equal(updater.getState().whatsNew, undefined)
	assert.equal(updater.getState().currentRelease, undefined)
})

test('reentrant install and failed install preserve explicit retry behavior', async () => {
	const { updater, native } = setup()
	await updater.check()
	updater.download()
	native.emit('update-downloaded', {}, '', '2.3.6')
	const args = { canInstall: () => true, prepareQuit: () => {} }
	assert.equal(updater.install({ ...args, canInstall: () => {
		assert.equal(updater.install(args), false)
		return false
	} }), false)
	native.quitAndInstall = () => {
		throw new Error('failure')
	}
	assert.equal(updater.install(args), false)
	assert.equal(updater.getState().status, 'ready')
	native.quitAndInstall = () => {}
	assert.equal(updater.install(args), true)
})

test('zero grace expires on display even if deadline persistence fails', async () => {
	let expirations = 0
	const required = { ...release('2.3.6', true), graceMinutes: 0 }
	const { updater } = setup({ fetchManifest: async () => manifest(required), onMandatoryExpired: () => {
		expirations++
	}, storage: { read: () => null, write: () => {
		throw new Error('disk')
	} } })
	await updater.check()
	assert.equal(expirations, 0)
	updater.noticeShown()
	updater.tick()
	assert.equal(expirations, 1)
})

test('mandatory metadata write failure locks normal use before notice and after restart/refetch', async () => {
	const storage = { read: () => null, write: () => {
		throw new Error('disk unavailable')
	} }
	const config = { storage, fetchManifest: async () => manifest(release('2.3.6', true)) }
	const first = setup(config).updater
	await first.check()
	assert.equal(first.getState().persistenceFailed, true)
	assert.equal(first.getState().expired, true)
	first.noticeShown()
	assert.equal(first.getState().expired, true)
	const restarted = setup(config).updater
	await restarted.check()
	assert.equal(restarted.getState().persistenceFailed, true)
	assert.equal(restarted.getState().expired, true)
	assert.match(restarted.getState().message, /normal use is unavailable/)
})

test('retrying persistence retains original deadline and unlocks only after durable save', async () => {
	let fails = true
	let saved
	const storage = { read: () => saved, write: (value) => {
		if (fails) {
			throw new Error('disk unavailable')
		}
		saved = structuredClone(value)
	} }
	const fixture = setup({ storage, fetchManifest: async () => manifest(release('2.3.6', true)) })
	await fixture.updater.check()
	fixture.updater.noticeShown()
	const deadline = fixture.updater.getState().deadline
	fixture.advance(60000)
	fails = false
	fixture.updater.noticeShown()
	assert.equal(fixture.updater.getState().deadline, deadline)
	assert.equal(fixture.updater.getState().persistenceFailed, false)
	assert.equal(fixture.updater.getState().expired, false)
	assert.equal(saved.policy.deadline, deadline)
	const restarted = setup({ storage }).updater
	assert.equal(restarted.getState().deadline, deadline)
})

test('cached expired relaunch accepts explicit download without successful metadata refresh', async () => {
	const original = setup({ fetchManifest: async () => manifest(release('2.3.6', true)) })
	await original.updater.check()
	original.updater.noticeShown()
	const deadline = original.updater.getState().deadline
	const relaunched = setup({ storage: original.storage, now: () => deadline + 1, fetchManifest: async () => {
		throw new Error('offline')
	} })
	assert.equal(relaunched.updater.getState().status, 'idle')
	assert.equal(relaunched.updater.getState().expired, true)
	assert.deepEqual(relaunched.calls, [])
	relaunched.updater.download()
	assert.deepEqual(relaunched.calls, [['feed', { url: 'https://updates.example/windows/x64/releases/2.3.6/' }], ['check']])
	assert.equal(relaunched.updater.getState().status, 'downloading')
	assert.equal(relaunched.updater.getState().deadline, deadline)
})
