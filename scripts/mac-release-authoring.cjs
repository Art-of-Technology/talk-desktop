/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
const { execFileSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { validateMacManifest } = require('../src/app/MacUpdateManifest.js')
const { feedBase } = require('../src/app/ReleaseManifest.js')

const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex')

/**
 * Require private storage for deployment-specific publication inputs.
 *
 * @param {string} filename Destination
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
 * Bind release notes and a locally qualified unsigned DMG to its destination.
 *
 * @param {string} manifestPath Draft metadata
 * @param {string} feedUrl HTTPS feed
 * @param {string} architecture arm64, x64 or universal
 * @param {string} dmgPath Local DMG
 */
async function review(manifestPath, feedUrl, architecture, dmgPath) {
	if (fs.statSync(manifestPath).size > 262144) {
		throw new Error('Manifest too large')
	}
	const metadata = fs.readFileSync(manifestPath)
	if (metadata.length > 262144) {
		throw new Error('Manifest too large')
	}
	const manifest = validateMacManifest(JSON.parse(metadata), feedUrl, architecture)
	const notes = manifest.releases.find((release) => release.version === manifest.latestVersion)
	if (!notes.summary.length || !notes.sections.length) {
		throw new Error('Publication requires both short summary and detailed release sections')
	}
	if (manifest.releases.some((release) => release.sections.some((section) => section.images.length))) {
		throw new Error('Mac publication tooling does not yet support screenshots; remove images from the draft')
	}
	const filename = path.posix.basename(new URL(notes.macDownload.url).pathname)
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.dmg$/.test(filename)) {
		throw new Error('DMG destination requires a plain safe .dmg filename')
	}
	if (!fs.statSync(dmgPath).isFile()) {
		throw new Error('DMG must be a regular file')
	}
	const hash = crypto.createHash('sha256')
	let size = 0
	let trailer = Buffer.alloc(0)
	for await (const chunk of fs.createReadStream(dmgPath)) {
		hash.update(chunk)
		size += chunk.length
		trailer = Buffer.concat([trailer, chunk]).subarray(-512)
	}
	if (size < 512 || trailer.toString('ascii', 0, 4) !== 'koly') {
		throw new Error('DMG lacks the UDIF koly trailer; native Mac qualification is still required')
	}
	const sha256 = hash.digest('hex')
	if (sha256 !== notes.macDownload.sha256 || size !== notes.macDownload.size) {
		throw new Error('DMG hash or size does not match metadata')
	}
	const binding = { schemaVersion: 1, feedUrl: feedBase(feedUrl), architecture, version: manifest.latestVersion, metadataSha256: digest(metadata), dmgSha256: sha256, dmgSize: size, dmgFilename: filename, downloadUrl: notes.macDownload.url, notes }
	return { ...binding, digest: digest(JSON.stringify(binding)) }
}

/**
 * Stage an explicitly approved, byte-identical publication bundle.
 *
 * @param {string} manifestPath Draft metadata
 * @param {string} feedUrl HTTPS feed
 * @param {string} architecture arm64, x64 or universal
 * @param {string} dmgPath Local DMG
 * @param {string} approvalPath Owner approval
 * @param {string} outputPath Fresh private bundle directory
 */
async function stage(manifestPath, feedUrl, architecture, dmgPath, approvalPath, outputPath) {
	const record = await review(manifestPath, feedUrl, architecture, dmgPath)
	const approval = JSON.parse(fs.readFileSync(approvalPath, 'utf8'))
	if (approval.schemaVersion !== 1 || approval.decision !== 'approved' || approval.digest !== record.digest || typeof approval.approvedBy !== 'string' || !approval.approvedBy.trim() || typeof approval.approvedAt !== 'string' || !Number.isFinite(Date.parse(approval.approvedAt))) {
		throw new Error('Explicit approval matching the exact reviewed digest is required')
	}
	const output = path.resolve(outputPath)
	const metadataPath = path.join(output, 'release-manifest.json')
	const receiptPath = path.join(output, 'approval-record.json')
	const pinned = path.join(output, 'releases', record.version, record.dmgFilename)
	for (const destination of [metadataPath, receiptPath, pinned]) {
		privateOutput(destination)
	}
	// Non-recursive creation reserves ownership: never remove or overwrite an existing root.
	try {
		fs.mkdirSync(output)
	} catch (error) {
		if (error.code === 'EEXIST') {
			throw new Error('Use a fresh publication bundle directory', { cause: error })
		}
		throw error
	}
	try {
		fs.mkdirSync(path.dirname(pinned), { recursive: true })
		fs.copyFileSync(dmgPath, pinned, fs.constants.COPYFILE_EXCL)
		const metadata = fs.readFileSync(manifestPath)
		if (digest(metadata) !== record.metadataSha256) {
			throw new Error('Metadata changed during staging')
		}
		fs.writeFileSync(metadataPath, metadata, { flag: 'wx' })
		const staged = await review(metadataPath, feedUrl, architecture, pinned)
		const rechecked = await review(manifestPath, feedUrl, architecture, dmgPath)
		if (staged.digest !== record.digest || rechecked.digest !== record.digest) {
			throw new Error('Inputs changed during staging')
		}
		fs.writeFileSync(receiptPath, JSON.stringify({ review: record, approval }, null, 2) + '\n', { flag: 'wx' })
		return { directory: output, version: record.version, digest: record.digest }
	} catch (error) {
		// Only this invocation's fresh, resolved bundle root is removed.
		fs.rmSync(output, { recursive: true, force: true })
		throw error
	}
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
			: Promise.reject(new Error('Usage: mac-release-authoring.cjs review <manifest.json> <feed-url> <arm64|x64|universal> <artifact.dmg> <review.json> OR stage <manifest.json> <feed-url> <arm64|x64|universal> <artifact.dmg> <approval.json> <fresh-bundle>'))
	run.then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
		console.error(error.message)
		process.exitCode = 1
	})
}

module.exports = { review, stage }
