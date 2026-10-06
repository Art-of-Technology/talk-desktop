/* SPDX-License-Identifier: AGPL-3.0-or-later */
const VERSION = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/
/**
 *
 * @param {string} a First stable version
 * @param {string} b Second stable version
 */
function compareVersions(a, b) {
	if (!VERSION.test(a) || !VERSION.test(b)) {
		throw new Error('Invalid version')
	}

	const left = a.split('.').map(Number)

	const right = b.split('.').map(Number)

	for (let i = 0; i < 3; i++) {
		if (left[i] !== right[i]) {
			return Math.sign(left[i] - right[i])
		}
	}

	return 0
}
/**
 *
 * @param {unknown} value Untrusted input
 */
function feedBase(value) {
	const url = new URL(value)

	if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) {
		throw new Error('Invalid feed')
	}

	if (!url.pathname.endsWith('/')) {
		url.pathname += '/'
	}

	return url.href
}
/**
 *
 * @param {unknown} value Untrusted input
 * @param {number} max Maximum allowed size
 */
function text(value, max) {
	// Reject non-printable metadata; line breaks and tabs remain usable in notes.
	// eslint-disable-next-line no-control-regex
	if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) {
		throw new Error('Invalid text')
	}

	return value
}
/**
 *
 * @param {unknown} value Untrusted input
 * @param {number} max Maximum allowed size
 */
function list(value, max) {
	if (!Array.isArray(value) || value.length > max) {
		throw new Error('Invalid list')
	}

	return value
}
/**
 *
 * @param {object} input Untrusted manifest
 * @param {string} feed Configured feed URL
 */
function validateManifest(input, feed) {
	if (Buffer.byteLength(JSON.stringify(input) || '') > 262144) {
		throw new Error('Manifest too large')
	}

	const base = new URL(feedBase(feed))

	if (!input || input.schemaVersion !== 1 || !VERSION.test(input.latestVersion)) {
		throw new Error('Invalid manifest')
	}

	const releases = list(input.releases, 100).map((release) => {
		if (!release || !VERSION.test(release.version) || typeof release.mandatory !== 'boolean') {
			throw new Error('Invalid release')
		}

		const graceMinutes = release.graceMinutes ?? 15

		if (!Number.isInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 10080) {
			throw new Error('Invalid grace')
		}

		return {
			version: release.version,
			title: text(release.title, 160),
			summary: list(release.summary, 10).map((item) => text(item, 500)),
			sections: list(release.sections, 30).map((section) => ({
				heading: text(section.heading, 160),
				body: text(section.body, 10000),
				images: list(section.images || [], 10).map((image) => {
					const url = new URL(image.url)

					if (url.protocol !== 'https:' || url.origin !== base.origin || !url.pathname.startsWith(base.pathname) || url.username || url.password || url.hash || url.search || /%2e|%2f|%5c/i.test(url.pathname)) {
						throw new Error('Invalid image')
					}

					return { url: url.href, alt: text(image.alt, 500), ...(image.caption === undefined ? {} : { caption: text(image.caption, 1000) }) }
				}),
			})),
			mandatory: release.mandatory,
			graceMinutes,
		}
	})

	if (new Set(releases.map((release) => release.version)).size !== releases.length || !releases.some((release) => release.version === input.latestVersion) || releases.some((release) => compareVersions(release.version, input.latestVersion) > 0)) {
		throw new Error('Invalid release versions')
	}

	return { schemaVersion: 1, latestVersion: input.latestVersion, releases }
}
module.exports = { validateManifest, compareVersions, feedBase }
