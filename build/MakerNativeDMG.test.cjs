/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const { mock, test } = require('node:test')
const { MakerNativeDMG } = require('./MakerNativeDMG.cjs')

let failCreation = false
const commands = []
mock.method(MakerNativeDMG.prototype, 'execute', async (command, args) => {
	commands.push([command, args])
	if (command.endsWith('/ditto')) {
		await fs.cp(args[0], args[1], { recursive: true })
	} else if (args[0] === 'create') {
		if (failCreation) {
			throw new Error('Disk full')
		}
		const source = args[args.indexOf('-srcfolder') + 1]
		assert.equal(await fs.readlink(path.join(source, 'Applications')), '/Applications')
		assert.equal(await fs.readFile(path.join(source, 'Example Talk.app', 'binary'), 'utf8'), 'app')
		await fs.writeFile(args.at(-1), 'verified image')
	}
})

test('DMG maker preserves existing releases, isolates architectures and cleans failed builds', async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'native-dmg-test-'))
	try {
		const dir = path.join(directory, 'package')
		await fs.mkdir(path.join(dir, 'Example Talk.app'), { recursive: true })
		await fs.writeFile(path.join(dir, 'Example Talk.app', 'binary'), 'app')
		for (const targetArch of ['arm64', 'x64', 'universal']) {
			const maker = new MakerNativeDMG((arch) => ({ name: `Example-macos-${arch}.dmg` }))
			await maker.prepareConfig(targetArch)
			const options = { dir, makeDir: path.join(directory, 'make'), appName: 'Example Talk', targetArch }
			const [artifact] = await maker.make(options)
			assert.equal(await fs.readFile(artifact, 'utf8'), 'verified image')
			assert.equal(path.basename(path.dirname(artifact)), targetArch)
			assert.deepEqual(await fs.readdir(path.dirname(artifact)), [path.basename(artifact)])
			assert.ok(commands.some(([command, args]) => command.endsWith('/hdiutil') && args[0] === 'verify'))
			const previousCommands = commands.length
			await assert.rejects(maker.make(options), /Refusing to overwrite/)
			assert.equal(commands.length, previousCommands)
			assert.equal(await fs.readFile(artifact, 'utf8'), 'verified image')
		}
		failCreation = true
		const maker = new MakerNativeDMG({ name: 'failure.dmg' })
		await maker.prepareConfig('arm64')
		const makeDir = path.join(directory, 'failed')
		await assert.rejects(maker.make({ dir, makeDir, appName: 'Example Talk', targetArch: 'arm64' }), /Disk full/)
		assert.deepEqual(await fs.readdir(path.join(makeDir, 'dmg', 'arm64')), [])
	} finally {
		await fs.rm(directory, { recursive: true, force: true })
		mock.restoreAll()
	}
})
