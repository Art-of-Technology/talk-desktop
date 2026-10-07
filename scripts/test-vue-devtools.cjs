/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')

/**
 * Load the installer with Electron and extraction isolated from the real profile.
 *
 * @param {boolean} isPackaged - Simulated application distribution state
 * @param {string} userData - Temporary profile path
 * @param {string[]} loaded - Observed extension paths
 */
async function installer(isPackaged, userData, loaded) {
	const sandbox = {
		module: { exports: {} },
		__dirname: path.resolve('src'),
		console: { log() {}, error(error) { throw error } },
		require(id) {
			if (id === 'electron') {
				return {
					app: { isPackaged, getPath() {
						assert.ok(!isPackaged)
						return userData
					} },
					session: { defaultSession: { extensions: { async loadExtension(directory) { loaded.push(directory) } } } },
				}
			}
			if (id === '../resources/vue-devtools.crx') {
				return 'devtools.crx'
			}
			if (id === 'unzip-crx-3') {
				return async (archive, directory) => fs.writeFile(path.join(directory, 'manifest.json'), '{}')
			}
			return require(id)
		},
	}
	vm.runInNewContext(await fs.readFile(path.resolve('src/install-vue-devtools.js'), 'utf8'), sandbox)
	return sandbox.module.exports.installVueDevtools
}

test('packaged application does not access the profile or load a development extension', async () => {
	const loaded = []
	await (await installer(true, '/unused', loaded))()
	assert.deepEqual(loaded, [])
})

test('development extension installs into a fresh profile and replaces its previous contents', async (t) => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'talk-devtools-test-'))
	t.after(() => fs.rm(directory, { recursive: true, force: true }))
	const profile = path.join(directory, 'new-profile')
	const loaded = []
	const install = await installer(false, profile, loaded)
	await install()
	const extension = path.join(profile, 'extensions', 'vuejs-devtools')
	assert.equal(await fs.readFile(path.join(extension, 'manifest.json'), 'utf8'), '{}')
	await fs.writeFile(path.join(extension, 'stale'), 'old')
	await install()
	await assert.rejects(fs.stat(path.join(extension, 'stale')), { code: 'ENOENT' })
	assert.deepEqual(loaded, [extension, extension])
})
