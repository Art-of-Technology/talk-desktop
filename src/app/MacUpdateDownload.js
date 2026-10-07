/* SPDX-License-Identifier: AGPL-3.0-or-later */
const { createHash } = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const MAX_BYTES = 2 * 1024 * 1024 * 1024
const MAX_TIMEOUT = 15 * 60 * 1000

/** Downloads unsigned macOS installers without opening or executing them. */
class MacUpdateDownload {
	constructor({ fetch, downloadsPath, timeout = MAX_TIMEOUT }) {
		if (typeof fetch !== 'function' || !path.isAbsolute(downloadsPath)
			|| !Number.isInteger(timeout) || timeout < 1 || timeout > MAX_TIMEOUT) {
			throw new Error('Invalid macOS download configuration')
		}
		this.fetch = fetch
		this.downloadsPath = downloadsPath
		this.timeout = timeout
		this.controllers = new Set()
		this.disposed = false
	}

	async download(artifact, version) {
		let target
		try {
			target = new URL(artifact.url)
		} catch {
			throw new Error('Invalid macOS download URL')
		}
		const filename = target.pathname.split('/').pop()
		if (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash
			|| !/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}\.dmg$/.test(filename)) {
			throw new Error('Invalid macOS download URL')
		}
		if (!Number.isSafeInteger(artifact.size) || artifact.size < 1 || artifact.size > MAX_BYTES
			|| !/^[a-fA-F0-9]{64}$/.test(artifact.sha256)
			|| !['arm64', 'x64', 'universal'].includes(artifact.arch) || artifact.signing !== 'unsigned'
			|| typeof version !== 'string' || !version || this.disposed) {
			throw new Error('Invalid macOS download request')
		}
		const controller = new AbortController()
		this.controllers.add(controller)
		const aborted = new Promise((resolve, reject) => {
			controller.signal.addEventListener('abort', () => reject(new Error('macOS download cancelled or timed out')), { once: true })
		})
		aborted.catch(() => {})
		// Race network operations as well as aborting: a stalled transport must not retain a partial file.
		const bounded = (operation) => Promise.race([operation, aborted])
		const timer = setTimeout(() => controller.abort(), this.timeout)
		let directory
		let file
		let reader
		let verified = false
		try {
			directory = await fs.mkdtemp(path.join(this.downloadsPath, 'desktop-update-'))
			await fs.chmod(directory, 0o700)
			const destination = path.join(directory, filename)
			const partial = `${destination}.part`
			file = await fs.open(partial, 'wx', 0o600)
			const response = await bounded(this.fetch(target.href, {
				redirect: 'error',
				credentials: 'omit',
				cache: 'no-store',
				signal: controller.signal,
				headers: { Accept: 'application/octet-stream' },
			}))
			if (!response.ok || response.redirected || response.url !== target.href || !response.body) {
				throw new Error('macOS installer unavailable')
			}
			const length = response.headers.get('content-length')
			if (length !== null && (!/^\d+$/.test(length) || Number(length) !== artifact.size)) {
				throw new Error('macOS installer size mismatch')
			}
			reader = response.body.getReader()
			const hash = createHash('sha256')
			let size = 0
			while (true) {
				const { done, value } = await bounded(reader.read())
				if (done) {
					break
				}
				size += value.byteLength
				if (size > artifact.size) {
					throw new Error('macOS installer size mismatch')
				}
				hash.update(value)
				await file.writeFile(value)
			}
			if (size !== artifact.size || hash.digest('hex') !== artifact.sha256.toLowerCase()) {
				throw new Error('macOS installer verification failed')
			}
			await file.close()
			file = undefined
			if (controller.signal.aborted) {
				throw new Error('macOS download cancelled or timed out')
			}
			// Linking publishes the verified file atomically and refuses an existing destination.
			await fs.link(partial, destination)
			await fs.unlink(partial)
			verified = true
			return destination
		} catch {
			// Transport and filesystem exceptions can contain private URLs or local account paths.
			throw new Error('Unable to download and verify macOS installer')
		} finally {
			clearTimeout(timer)
			controller.abort()
			this.controllers.delete(controller)
			// Cancellation must not delay removal if the transport never settles.
			if (reader) {
				reader.cancel().catch(() => {})
			}
			const cleanup = async () => {
				try {
					try {
						await file?.close()
					} finally {
						if (!verified && directory) {
							await fs.rm(directory, { recursive: true, force: true })
						}
					}
				} catch { throw new Error('Unable to clean up macOS download') }
			}
			await cleanup()
		}
	}

	dispose() {
		this.disposed = true
		for (const controller of this.controllers) {
			controller.abort()
		}
	}
}

module.exports = { MacUpdateDownload }
