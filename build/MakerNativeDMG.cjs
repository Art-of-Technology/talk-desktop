/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const { MakerBase } = require('@electron-forge/maker-base')
const { execFile } = require('node:child_process')
const { constants } = require('node:fs')
const fs = require('node:fs/promises')
const path = require('node:path')
const { promisify } = require('node:util')

const run = promisify(execFile)

/** Native DMG creation avoids appdmg's obsolete Node.js APIs. */
class MakerNativeDMG extends MakerBase {
	name = 'dmg'
	defaultPlatforms = ['darwin']
	requiredExternalBinaries = ['hdiutil', 'ditto']

	isSupportedOnCurrentPlatform() {
		return process.platform === 'darwin'
	}

	async execute(command, args) {
		return run(command, args)
	}

	async make({ dir, makeDir, appName, targetArch }) {
		const outputDir = path.resolve(makeDir, 'dmg', targetArch)
		const output = path.join(outputDir, this.config.name)
		await fs.mkdir(outputDir, { recursive: true })
		// Do not replace an existing release, even when multiple makers run.
		try {
			await fs.lstat(output)
			throw new Error(`Refusing to overwrite existing DMG: ${output}`)
		} catch (error) {
			if (error.code !== 'ENOENT') {
				throw error
			}
		}
		const temporary = await fs.mkdtemp(path.join(outputDir, '.dmg-'))
		try {
			const source = path.join(temporary, 'source')
			await fs.mkdir(source)
			// ditto preserves bundle symlinks, permissions and extended attributes.
			await this.execute('/usr/bin/ditto', [path.join(dir, `${appName}.app`), path.join(source, `${appName}.app`)])
			await fs.symlink('/Applications', path.join(source, 'Applications'))
			const image = path.join(temporary, 'installer.dmg')
			await this.execute('/usr/bin/hdiutil', ['create', '-volname', appName, '-srcfolder', source, '-format', 'UDZO', '-fs', 'HFS+', image])
			await this.execute('/usr/bin/hdiutil', ['verify', image])
			await fs.copyFile(image, output, constants.COPYFILE_EXCL)
			return [output]
		} finally {
			await fs.rm(temporary, { recursive: true, force: true })
		}
	}
}

module.exports = { MakerNativeDMG }
