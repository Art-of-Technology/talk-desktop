/* SPDX-License-Identifier: AGPL-3.0-or-later */
const { randomUUID } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const MAX_BYTES = 262144

/**
 * Main-process-only storage, separate from renderer-editable app preferences.
 *
 * @param {string} directory Application-owned userData directory.
 */
function createReleaseStorage(directory) {
	const filename = path.join(directory, 'desktop-release-state.json')
	return {
		read() {
			try {
				if (fs.statSync(filename).size > MAX_BYTES * 2) {
					return null
				}
				return JSON.parse(fs.readFileSync(filename, 'utf8'))
			} catch { return null }
		},
		write(value) {
			const data = JSON.stringify(value)
			if (Buffer.byteLength(data) > MAX_BYTES * 2) {
				throw new Error('Release state too large')
			}
			fs.mkdirSync(directory, { recursive: true })
			const temporary = path.join(directory, `.desktop-release-${randomUUID()}.tmp`)
			try {
				fs.writeFileSync(temporary, data, { mode: 0o600, flag: 'wx' })
				fs.renameSync(temporary, filename)
			} finally {
				try {
					fs.unlinkSync(temporary)
				} catch { /* Rename consumed the temporary file. */ }
			}
		},
	}
}

/**
 * Bounded HTTPS metadata fetch. Never follow redirects or send account credentials.
 *
 * @param {typeof globalThis.fetch} fetch Main-process fetch implementation.
 * @param {number} timeout Request timeout in milliseconds.
 */
function createManifestFetcher(fetch, timeout = 10000) {
	return async (url) => {
		const target = new URL(url)
		if (target.protocol !== 'https:' || target.username || target.password || target.hash || target.search) {
			throw new Error('Invalid release metadata URL')
		}
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), timeout)
		let reader
		try {
			const response = await fetch(target.href, {
				redirect: 'error',
				credentials: 'omit',
				cache: 'no-store',
				signal: controller.signal,
				headers: { Accept: 'application/json' },
			})
			if (!response.ok || response.redirected || Number(response.headers.get('content-length')) > MAX_BYTES) {
				throw new Error('Release metadata unavailable')
			}
			reader = response.body.getReader()
			const chunks = []
			let size = 0
			while (true) {
				const { done, value } = await reader.read()
				if (done) {
					break
				}
				size += value.byteLength
				if (size > MAX_BYTES) {
					throw new Error('Release metadata too large')
				}
				chunks.push(Buffer.from(value))
			}
			return JSON.parse(Buffer.concat(chunks).toString('utf8'))
		} finally {
			clearTimeout(timer)
			await reader?.cancel().catch(() => {})
		}
	}
}

module.exports = { createReleaseStorage, createManifestFetcher }
