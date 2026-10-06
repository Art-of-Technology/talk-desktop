/* SPDX-License-Identifier: AGPL-3.0-or-later */
const { validateManifest, compareVersions, feedBase } = require('./ReleaseManifest.js')
const clone = (value) => JSON.parse(JSON.stringify(value))

// Native discovery downloads immediately. Invoke it only after explicit consent.
class DesktopUpdater {
	constructor({ autoUpdater, feedUrl, supported, installedVersion, fetchManifest, storage = { read: () => null, write: () => {} }, now = Date.now, onState = () => {}, onMandatoryExpired = () => {} }) {
		Object.assign(this, { autoUpdater, installedVersion, fetchManifest, storage, now, onState, onMandatoryExpired })

		this.state = { status: 'disabled' }

		this.installing = false

		this.enabled = false

		this.listeners = []

		this.saved = { acknowledged: [] }

		if (!feedUrl) {
			return
		}

		try {
			this.feedUrl = feedBase(feedUrl)

			compareVersions(installedVersion, installedVersion)
		} catch {
			this.state = { status: 'error', message: 'The update configuration is invalid.' }

			return
		}

		if (!supported) {
			this.state = { status: 'unsupported' }

			return
		}

		this.enabled = true

		this.state = { status: 'idle' }

		try {
			const saved = storage.read()

			if (saved && saved.feedUrl === this.feedUrl) {
				if (saved.manifest) {
					this.manifest = validateManifest(saved.manifest, this.feedUrl)
				}

				this.saved.acknowledged = Array.isArray(saved.acknowledged) ? saved.acknowledged.filter((v) => typeof v === 'string').slice(-100) : []

				this.applyPolicy()

				if (this.policy && saved.policy?.version === this.policy.version && Number.isSafeInteger(saved.policy.deadline) && saved.policy.deadline >= 0) {
					this.policy.deadline = saved.policy.deadline
				}
			}
		} catch { /* Untrusted or corrupted cache cannot introduce a policy. */ }

		this.listen('update-downloaded', (_event, _notes, version) => {
			if (this.state.status !== 'downloading') {
				return
			}

			if (version !== this.accepted?.version) {
				this.setState({ status: 'error', message: 'Downloaded version does not match the approved update.' })

				return
			}

			this.setState({ status: 'ready' })
		})

		this.listen('update-not-available', () => {
			if (this.state.status === 'downloading') {
				this.setState({ status: 'error', message: 'The approved update is not available. Please try again later.' })
			}
		})

		this.listen('error', () => {
			if (this.installing) {
				this.installing = false

				this.setState({ status: 'ready', message: 'Could not restart to update. Please try again.' })
			} else if (this.state.status === 'downloading') {
				this.setState({ status: 'error', message: 'Could not download the update. Please try again later.' })
			}
		})
	}

	listen(event, handler) {
		this.autoUpdater.on(event, handler)

		this.listeners.push([event, handler])
	}

	dispose() {
		this.disposed = true

		for (const [event, handler] of this.listeners) {
			this.autoUpdater.removeListener(event, handler)
		}
	}

	persist() {
		try {
			this.storage.write({ ...this.saved, feedUrl: this.feedUrl, manifest: this.manifest, policy: this.policy })
			this.persistenceFailed = false

			return true
		} catch {
			this.persistenceFailed = Boolean(this.policy)
			return false
		}
	}

	applyPolicy() {
		const required = this.manifest?.releases.filter((release) => release.mandatory && compareVersions(release.version, this.installedVersion) > 0).sort((a, b) => compareVersions(b.version, a.version))[0]

		if (!required) {
			this.policy = undefined
			this.persistenceFailed = false

			this.expirationSent = false
		} else if (this.policy?.version !== required.version) {
			this.policy = { version: required.version, graceMinutes: required.graceMinutes }

			this.expirationSent = false
		}
	}

	getState() {
		const offered = this.accepted || this.manifest?.releases.find((release) => release.version === this.manifest.latestVersion && compareVersions(release.version, this.installedVersion) > 0)

		const installed = this.manifest?.releases.find((release) => release.version === this.installedVersion)

		const persistenceFailed = Boolean(this.policy && this.persistenceFailed)
		return clone({ ...this.state, ...(offered ? { version: offered.version, release: offered } : {}), mandatory: Boolean(this.policy), persistenceFailed, ...(this.policy?.deadline !== undefined ? { deadline: this.policy.deadline, expired: this.now() >= this.policy.deadline } : {}), ...(persistenceFailed ? { expired: true, message: 'The required update policy could not be saved. Update or quit; normal use is unavailable until it can be saved.' } : {}), ...(installed ? { currentRelease: installed, ...(this.saved.acknowledged.includes(installed.version) ? {} : { whatsNew: installed }) } : {}) })
	}

	setState(state) {
		this.state = state

		this.onState(this.getState())
	}

	async check() {
		if (!this.enabled || this.installing || this.disposed || this.checking) {
			return this.getState()
		}

		this.checking = true
		const nativeActive = ['downloading', 'ready'].includes(this.state.status)
		if (!nativeActive) {
			this.setState({ status: 'checking' })
		}

		try {
			const manifest = validateManifest(await this.fetchManifest(new URL('release-manifest.json', this.feedUrl).href), this.feedUrl)

			if (this.disposed) {
				return this.getState()
			}

			this.manifest = manifest

			if (!nativeActive) {
				this.accepted = undefined
			}

			this.applyPolicy()

			this.persist()

			this.setState(nativeActive ? this.state : { status: compareVersions(manifest.latestVersion, this.installedVersion) > 0 ? 'available' : 'idle' })
		} catch {
			if (!this.disposed) {
				this.setState({ status: nativeActive ? this.state.status : 'error', message: 'Could not check for updates. Please try again later.' })
			}
		} finally {
			this.checking = false
		}

		this.tick()

		return this.getState()
	}

	download() {
		if (!this.enabled || this.disposed || this.installing || !['idle', 'available', 'error'].includes(this.state.status)) {
			return this.getState()
		}

		const release = this.getState().release

		if (!release) {
			return this.getState()
		}

		this.accepted = clone(release)

		this.setState({ status: 'downloading' })

		try {
			this.autoUpdater.setFeedURL({ url: new URL(`releases/${release.version}/`, this.feedUrl).href })

			this.autoUpdater.checkForUpdates()
		} catch {
			this.setState({ status: 'error', message: 'Could not download the update. Please try again later.' })
		}

		return this.getState()
	}

	noticeShown() {
		if (this.policy && (this.policy.deadline === undefined || this.persistenceFailed)) {
			if (this.policy.deadline === undefined) {
				this.policy.deadline = this.now() + this.policy.graceMinutes * 60000
			}
			this.persist()
			this.onState(this.getState())
		}

		this.tick()

		return this.getState()
	}

	tick() {
		if (!this.disposed && this.policy?.deadline !== undefined && this.now() >= this.policy.deadline && !this.expirationSent) {
			this.expirationSent = true

			this.onState(this.getState())

			this.onMandatoryExpired(this.getState())
		}
	}

	acknowledgeNotes(version) {
		if (version !== this.installedVersion || !this.manifest?.releases.some((release) => release.version === version)) {
			return false
		}

		const old = this.saved.acknowledged

		this.saved.acknowledged = [...new Set([...old, version])].slice(-100)

		if (!this.persist()) {
			this.saved.acknowledged = old

			return false
		}

		this.onState(this.getState())

		return true
	}

	install({ canInstall, prepareQuit }) {
		if (!this.enabled || this.disposed || this.installing || this.state.status !== 'ready') {
			return false
		}

		this.installing = true

		try {
			if (canInstall() !== true) {
				this.installing = false

				return false
			}

			prepareQuit()

			this.autoUpdater.quitAndInstall()

			return true
		} catch {
			this.installing = false

			this.setState({ status: 'ready', message: 'Could not restart. Please try again.' })

			return false
		}
	}
}
module.exports = { DesktopUpdater }
