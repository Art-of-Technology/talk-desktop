/* SPDX-License-Identifier: AGPL-3.0-or-later */
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { DesktopUpdater } = require('../src/app/DesktopUpdater.js')
const { validateMacManifest, resolveUpdateFeed } = require('../src/app/MacUpdateManifest.js')
const feed = 'https://updates.example/macos/arm64/stable/'
const release = (version = '2.3.8') => ({ version, title: 'Mac update', summary: ['Improved notifications'], sections: [{ heading: 'Changes', body: 'New capability', images: [] }], mandatory: false, macDownload: { url: `${feed}releases/${version}/Talk.dmg`, size: 1024, sha256: 'a'.repeat(64), arch: 'arm64', signing: 'unsigned' } })
const manifest = (item = release()) => ({ schemaVersion: 1, latestVersion: item.version, releases: [item] })

test('Mac requires an explicit architecture feed and never inherits Windows', () => {
	const config = { updateFeedUrl: 'https://updates.example/windows/', macUpdateFeedUrls: { arm64: feed } }
	assert.equal(resolveUpdateFeed(config, 'darwin', 'arm64'), feed)
	assert.equal(resolveUpdateFeed(config, 'darwin', 'x64'), null)
	assert.equal(resolveUpdateFeed(config, 'win32', 'x64'), config.updateFeedUrl)
	assert.equal(resolveUpdateFeed(config, 'linux', 'x64'), null)
})

test('Mac accepts matching and universal artifacts but rejects wrong architecture and forced-close policies', () => {
	assert.equal(validateMacManifest(manifest(), feed, 'arm64').latestVersion, '2.3.8')
	assert.throws(() => validateMacManifest(manifest(), feed, 'x64'))
	const universal = release()
	universal.macDownload.arch = 'universal'
	assert.equal(validateMacManifest(manifest(universal), feed, 'x64').releases[0].macDownload.arch, 'universal')
	universal.mandatory = true
	assert.throws(() => validateMacManifest(manifest(universal), feed, 'arm64'))
})

for (const url of ['http://updates.example/Talk.dmg', `${feed}releases/2.3.7/Talk.dmg`, `${feed}releases/2.3.8/Talk.exe`, `${feed}releases/2.3.8/%2e%2e/Talk.dmg`, `${feed}releases/2.3.8/Talk.dmg?token=secret`, 'https://other.example/Talk.dmg']) {
	test(`rejects an unpinned or foreign artifact: ${url}`, () => {
		const item = release()
		item.macDownload.url = url
		assert.throws(() => validateMacManifest(manifest(item), feed, 'arm64'))
	})
}

test('Mac discovery, consent, download completion and reveal never use native installation', async () => {
	let downloads = 0
	let resolveDownload
	let current = manifest()
	const updater = new DesktopUpdater({
		feedUrl: feed,
		supported: true,
		installedVersion: '2.3.7',
		arch: 'arm64',
		fetchManifest: async () => current,
		autoUpdater: new Proxy({}, { get: () => assert.fail('Must not touch native updater') }),
		manualDownloader: { download: async (artifact, version) => {
			downloads++
			assert.equal(version, '2.3.8')
			assert.equal(artifact.url, release().macDownload.url)
			return new Promise((resolve) => {
				resolveDownload = resolve
			})
		}, dispose() {} },
	})
	assert.equal((await updater.check()).status, 'available')
	assert.equal(updater.getState().manualInstall, true)
	assert.equal(downloads, 0)
	assert.equal(updater.getManualDownload(), undefined)
	const download = updater.download()
	await updater.download()
	assert.equal(downloads, 1)
	current = manifest(release('2.3.9'))
	await updater.check()
	assert.equal(updater.getState().version, '2.3.8')
	resolveDownload('/private/downloads/Talk.dmg')
	await download
	assert.equal(updater.getState().status, 'ready')
	assert.equal(updater.getManualDownload(), '/private/downloads/Talk.dmg')
	assert.equal(JSON.stringify(updater.getState()).includes('/private/downloads'), false)
	assert.equal(updater.install({ canInstall: () => true, prepareQuit: () => assert.fail() }), false)
	updater.dispose()
})

test('Mac download verification failures expose no installer and allow retry', async () => {
	let attempt = 0
	const updater = new DesktopUpdater({ feedUrl: feed, supported: true, installedVersion: '2.3.7', arch: 'arm64', fetchManifest: async () => manifest(), manualDownloader: { download: async () => {
		if (++attempt === 1) {
			throw new Error('bad bytes')
		}
		return '/downloads/Talk.dmg'
	}, dispose() {} } })
	await updater.check()
	await updater.download()
	assert.equal(updater.getState().status, 'error')
	assert.equal(updater.getManualDownload(), undefined)
	await updater.download()
	assert.equal(updater.getState().status, 'ready')
	updater.missingManualDownload()
	assert.equal(updater.getState().status, 'error')
	assert.equal(updater.getManualDownload(), undefined)
	await updater.download()
	assert.equal(updater.getState().status, 'ready')
	assert.equal(attempt, 3)
})

test('Mac first launch after replacement offers notes for the installed version', async () => {
	const updater = new DesktopUpdater({ feedUrl: feed, supported: true, installedVersion: '2.3.8', arch: 'arm64', fetchManifest: async () => manifest(), manualDownloader: { dispose() {} } })
	assert.equal((await updater.check()).status, 'idle')
	assert.equal(updater.getState().whatsNew.version, '2.3.8')
	assert.equal(updater.acknowledgeNotes('2.3.8'), true)
	assert.equal(updater.getState().whatsNew, undefined)
})
