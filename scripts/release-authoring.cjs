const { execFileSync } = require('node:child_process')
/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { readPackageVersion } = require('./read-package-version.cjs')
const { parseManifest, stageUpdate } = require('./stage-desktop-update.cjs')

const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')
const { validateManifest, feedBase } = require('../src/app/ReleaseManifest.js')
/**
 * Bind approved local screenshots to immutable public paths.
 *
 * @param {object} manifest Validated metadata
 * @param {string} manifestPath Private draft path
 * @param {string} feed Feed base
 */
function screenshots(manifest, manifestPath, feed) {
	const root = fs.realpathSync(path.dirname(path.resolve(manifestPath)))
	const assets = new Map()
	for (const release of manifest.releases) {
		for (const image of release.sections.flatMap((section) => section.images)) {
			const relative = new URL(image.url).pathname.slice(new URL(feed).pathname.length)
			if (!relative.startsWith(`assets/${release.version}/`) || !/^[A-Za-z0-9_./-]+\.(png|jpe?g|webp)$/i.test(relative) || relative.split('/').some((part) => part === '.' || part === '..')) {
				throw new Error('Screenshot must use a versioned assets path with PNG/JPEG/WebP extension')
			}
			const source = fs.realpathSync(path.join(root, relative))
			if (!source.startsWith(root + path.sep)) {
				throw new Error('Screenshot source escapes the private draft directory')
			}
			if (fs.statSync(source).size > 10 * 1024 * 1024) {
				throw new Error('Screenshot exceeds 10 MiB')
			}
			const bytes = fs.readFileSync(source)
			const ext = path.extname(relative).toLowerCase()
			const valid = ext === '.png'
				? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
				: ext === '.webp'
					? bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
					: bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
			if (!valid) {
				throw new Error('Screenshot content does not match image extension')
			}
			assets.set(relative, { path: relative, sha256: digest(bytes), size: bytes.length })
		}
	}
	return [...assets.values()].sort((a, b) => a.path.localeCompare(b.path))
}
/**
 *
 * @param {string} filename Private destination
 */
function privateOutput(filename) {
	const repo = path.resolve(__dirname, '..')
	const relative = path.relative(repo, path.resolve(filename))
	if (!relative || (!relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))) {
		try {
			execFileSync('git', ['check-ignore', '--quiet', '--', filename], { cwd: repo, stdio: 'ignore' })
		} catch {
			throw new Error('Release output inside the repository must be ignored by Git')
		}
	}
}
/**
 *
 * @param {string} manifestPath Draft JSON path
 * @param {string} feedUrl HTTPS feed destination
 * @param {string} releasesPath Native RELEASES path
 * @param {string} packagePath Full package path
 */
async function review(manifestPath, feedUrl, releasesPath, packagePath) {
	const metadata = fs.readFileSync(manifestPath)
	if (metadata.length > 262144) {
		throw new Error('Manifest too large')
	}
	const manifest = validateManifest(JSON.parse(metadata), feedUrl)
	const proposed = manifest.releases.find((release) => release.version === manifest.latestVersion)
	if (!proposed.summary.length || !proposed.sections.length) {
		throw new Error('Publication requires both short summary and detailed release sections')
	}
	const feed = feedBase(feedUrl)
	const releasesBytes = fs.readFileSync(releasesPath)
	const native = parseManifest(releasesBytes.toString('utf8'))
	if (!native.filename.endsWith(`-${manifest.latestVersion}-full.nupkg`)) {
		throw new Error('Package filename version differs from latestVersion')
	}
	const sha1 = crypto.createHash('sha1')
	const sha256 = crypto.createHash('sha256')
	let size = 0
	for await (const chunk of fs.createReadStream(packagePath)) {
		sha1.update(chunk)
		sha256.update(chunk)
		size += chunk.length
	}
	if (size !== native.size || sha1.digest('hex') !== native.sha1) {
		throw new Error('Package does not match RELEASES')
	}
	if (readPackageVersion(packagePath) !== manifest.latestVersion) {
		throw new Error('Embedded package version differs from approved latestVersion')
	}
	const binding = { schemaVersion: 1, feedUrl: feed, version: manifest.latestVersion, metadataSha256: digest(metadata), releasesSha256: digest(releasesBytes), packageSha256: sha256.digest('hex'), packageFilename: native.filename, packageSize: size, screenshots: screenshots(manifest, manifestPath, feed) }
	return { ...binding, digest: digest(JSON.stringify(binding)), notes: manifest.releases.find((release) => release.version === manifest.latestVersion) }
}

/**
 *
 * @param {string} manifestPath Draft JSON path
 * @param {string} feedUrl HTTPS feed destination
 * @param {string} releasesPath Native RELEASES path
 * @param {string} packagePath Full package path
 * @param {string} approvalPath Explicit approval record path
 * @param {string} outputPath Fresh bundle directory
 */
async function stage(manifestPath, feedUrl, releasesPath, packagePath, approvalPath, outputPath) {
	const record = await review(manifestPath, feedUrl, releasesPath, packagePath)
	const approval = JSON.parse(fs.readFileSync(approvalPath, 'utf8'))
	if (approval.schemaVersion !== 1 || approval.decision !== 'approved' || approval.digest !== record.digest || typeof approval.approvedBy !== 'string' || !approval.approvedBy.trim() || !Number.isFinite(Date.parse(approval.approvedAt))) {
		throw new Error('Explicit approval matching the exact reviewed digest is required')
	}
	const output = path.resolve(outputPath)
	privateOutput(path.join(output, 'release-manifest.json'))
	privateOutput(path.join(output, 'approval-record.json'))
	if (fs.existsSync(output)) {
		throw new Error('Use a fresh publication bundle directory')
	}
	const pinned = path.join(output, 'releases', record.version)
	await stageUpdate(releasesPath, packagePath, pinned)
	const staged = await review(manifestPath, feedUrl, path.join(pinned, 'RELEASES'), path.join(pinned, record.packageFilename))
	// RELEASES is normalized by stageUpdate; the package itself must remain byte-identical.
	if (staged.packageSha256 !== record.packageSha256) {
		throw new Error('Staged package differs from approved artifact')
	}
	// Recheck after copying so changed source metadata/artifacts cannot bypass approval.
	const rechecked = await review(manifestPath, feedUrl, releasesPath, packagePath)
	if (rechecked.digest !== record.digest) {
		throw new Error('Inputs changed during staging; discard unpublished bundle')
	}
	const metadata = fs.readFileSync(manifestPath)
	if (digest(metadata) !== record.metadataSha256) {
		throw new Error('Metadata changed during staging')
	}
	for (const asset of record.screenshots) {
		const bytes = fs.readFileSync(path.join(path.dirname(manifestPath), asset.path))
		if (digest(bytes) !== asset.sha256) {
			throw new Error('Screenshot changed after approval')
		}
		const destination = path.join(output, asset.path)
		privateOutput(destination)
		fs.mkdirSync(path.dirname(destination), { recursive: true })
		fs.writeFileSync(destination, bytes, { flag: 'wx' })
	}
	fs.writeFileSync(path.join(output, 'release-manifest.json'), metadata, { flag: 'wx' })
	fs.writeFileSync(path.join(output, 'approval-record.json'), JSON.stringify({ review: record, approval }, null, 2) + '\n', { flag: 'wx' })
	return { directory: output, version: record.version, digest: record.digest }
}

if (require.main === module) {
	const [command, ...args] = process.argv.slice(2)
	const run = command === 'review' && args.length === 5
		? review(...args.slice(0, 4)).then((record) => {
				privateOutput(args[4])
				fs.writeFileSync(args[4], JSON.stringify(record, null, 2) + '\n', { flag: 'wx' })
				return record
			})
		: command === 'stage' && args.length === 6
			? stage(...args)
			: Promise.reject(new Error('Usage: release-authoring.cjs review <manifest.json> <feed-url> <RELEASES> <full.nupkg> <review.json> OR stage <manifest.json> <feed-url> <RELEASES> <full.nupkg> <approval.json> <fresh-bundle>'))
	run.then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
		console.error(error.message)
		process.exitCode = 1
	})
}
module.exports = { review, stage, validateManifest }
