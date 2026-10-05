/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const { execFileSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

/**
 *
 * @param {string} text RELEASES manifest contents
 */
function parseManifest(text) {
	const lines = text.trim().split(/\r?\n/)
	if (lines.length !== 1) {
		throw new Error('Expected one full package in the RELEASES manifest')
	}
	const match = /^([a-fA-F0-9]{40}) ([A-Za-z0-9][A-Za-z0-9._-]*-full\.nupkg) ([1-9][0-9]*)$/.exec(lines[0])
	if (!match || match[2].includes('..')) {
		throw new Error('Invalid RELEASES manifest or unsafe package filename')
	}
	const size = Number(match[3])
	if (!Number.isSafeInteger(size)) {
		throw new Error('Invalid package size')
	}
	return { sha1: match[1].toLowerCase(), filename: match[2], size }
}

/**
 *
 * @param {string} filename Package path
 */
async function hashFile(filename) {
	const hash = crypto.createHash('sha1')
	for await (const chunk of fs.createReadStream(filename)) {
		hash.update(chunk)
	}
	return hash.digest('hex')
}

/**
 *
 * @param {string} manifestPath Renamed manifest path
 * @param {string} packagePath Renamed full package path
 * @param {string} outputPath Ignored or external staging directory
 */
async function stageUpdate(manifestPath, packagePath, outputPath) {
	const manifest = parseManifest(fs.readFileSync(manifestPath, 'utf8'))
	if (fs.statSync(packagePath).size !== manifest.size || await hashFile(packagePath) !== manifest.sha1) {
		throw new Error('Package size or SHA1 does not match RELEASES; nothing staged')
	}
	const output = path.resolve(outputPath)
	// Do not let deployment-specific release files enter the shared source tree.
	const repo = path.resolve(__dirname, '..')
	const relative = path.relative(repo, output)
	if (!relative || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) {
		try {
			for (const name of [manifest.filename, 'RELEASES']) {
				execFileSync('git', ['check-ignore', '--quiet', '--', path.join(output, name)], { cwd: repo, stdio: 'ignore' })
			}
		} catch {
			throw new Error('Output inside the repository must be ignored by Git')
		}
	}
	fs.mkdirSync(output, { recursive: true })
	const destination = path.join(output, manifest.filename)
	const releases = path.join(output, 'RELEASES')
	if (fs.existsSync(destination) || fs.existsSync(releases)) {
		throw new Error('Use a fresh staging directory; existing releases will not be overwritten')
	}
	fs.copyFileSync(packagePath, destination, fs.constants.COPYFILE_EXCL)
	try {
		if (fs.statSync(destination).size !== manifest.size || await hashFile(destination) !== manifest.sha1) {
			throw new Error('Staged package verification failed')
		}
		fs.writeFileSync(releases, `${manifest.sha1} ${manifest.filename} ${manifest.size}\n`, { flag: 'wx' })
	} catch (error) {
		fs.unlinkSync(destination)
		throw error
	}
	return { directory: output, ...manifest }
}

if (require.main === module) {
	const args = process.argv.slice(2)
	if (args.length !== 3) {
		console.error('Usage: node scripts/stage-desktop-update.cjs <renamed-RELEASES> <renamed-full.nupkg> <fresh-output-directory>')
		process.exitCode = 1
	} else {
		stageUpdate(...args).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
			console.error(error.message)
			process.exitCode = 1
		})
	}
}
module.exports = { parseManifest, stageUpdate }
