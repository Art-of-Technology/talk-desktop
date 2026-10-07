/* SPDX-License-Identifier: AGPL-3.0-or-later */
const { validateManifest, feedBase } = require('./ReleaseManifest.js')

/**
 * Validate an unsigned, manually installed Mac release independently of Windows.
 *
 * @param {object} input Untrusted metadata
 * @param {string} feed Configured HTTPS feed
 * @param {string} arch Runtime or publication architecture
 */
function validateMacManifest(input, feed, arch) {
	if (!['arm64', 'x64', 'universal'].includes(arch)) {
		throw new Error('Unsupported Mac architecture')
	}
	const manifest = validateManifest(input, feed)
	const base = new URL(feedBase(feed))
	manifest.releases = manifest.releases.map((release) => {
		// Manual installation is not a qualified mandatory-update route.
		if (release.mandatory) {
			throw new Error('Mandatory Mac manual updates are not supported')
		}
		const artifact = input.releases.find((item) => item.version === release.version).macDownload
		if (!artifact || ![arch, 'universal'].includes(artifact.arch) || artifact.signing !== 'unsigned'
			|| !/^[a-f0-9]{64}$/.test(artifact.sha256) || !Number.isSafeInteger(artifact.size)
			|| artifact.size < 512 || artifact.size > 2 * 1024 * 1024 * 1024) {
			throw new Error('Invalid Mac artifact')
		}
		const url = new URL(artifact.url)
		const prefix = `${base.pathname}releases/${release.version}/`
		if (url.protocol !== 'https:' || url.origin !== base.origin || url.username || url.password || url.search || url.hash
			|| !url.pathname.startsWith(prefix) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.dmg$/.test(url.pathname.slice(prefix.length))) {
			throw new Error('Mac artifact must use its immutable feed version path')
		}
		return { ...release, macDownload: { url: url.href, sha256: artifact.sha256, size: artifact.size, arch: artifact.arch, signing: 'unsigned' } }
	})
	return manifest
}

/**
 * A legacy Windows feed must never become a Mac feed by fallback.
 *
 * @param {object} config Build profile
 * @param {string} platform Runtime operating system
 * @param {string} arch Runtime architecture
 */
function resolveUpdateFeed(config, platform, arch) {
	if (platform === 'darwin') {
		return ['arm64', 'x64'].includes(arch) ? config.macUpdateFeedUrls?.[arch] ?? null : null
	}
	return platform === 'win32' ? config.updateFeedUrl : null
}

module.exports = { validateMacManifest, resolveUpdateFeed }
