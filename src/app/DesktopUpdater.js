/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Native dependencies are injected so tests never download or install anything.
class DesktopUpdater {
	constructor({ autoUpdater, feedUrl, supported, onState = () => {} }) {
		Object.assign(this, { autoUpdater, onState })
		this.installing = false
		this.enabled = false
		this.state = { status: 'disabled' }
		if (!feedUrl) {
			return
		}
		try {
			const url = new URL(feedUrl)
			if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
				throw new Error('Invalid update feed')
			}
			this.feedUrl = url.href
		} catch {
			this.state = { status: 'error', message: 'The update feed must use HTTPS without embedded credentials or fragments.' }
			return
		}
		if (!supported) {
			this.state = { status: 'unsupported' }
			return
		}
		this.enabled = true
		this.state = { status: 'idle' }
		autoUpdater.on('checking-for-update', () => {
			if (this.state.status === 'checking') {
				this.setState({ status: 'checking' })
			}
		})
		autoUpdater.on('update-available', () => {
			if (this.state.status === 'checking') {
				this.setState({ status: 'downloading' })
			}
		})
		autoUpdater.on('update-not-available', () => {
			if (this.state.status === 'checking') {
				this.setState({ status: 'idle', message: 'You are up to date.' })
			}
		})
		autoUpdater.on('update-downloaded', (_event, _notes, releaseName) => {
			if (['checking', 'downloading'].includes(this.state.status)) {
				this.setState({ status: 'ready', ...(typeof releaseName === 'string' ? { version: releaseName.slice(0, 128) } : {}) })
			}
		})
		autoUpdater.on('error', () => {
			// Never forward native error strings: they can include feed credentials.
			if (this.installing) {
				this.installing = false
				this.setState({ status: 'error', message: 'Could not restart to update. Please try again later.' })
			} else if (this.state.status !== 'ready') {
				this.setState({ status: 'error', message: 'Could not download an update. Please try again later.' })
			}
		})
	}

	getState() {
		return { ...this.state }
	}

	setState(state) {
		this.state = state
		this.onState(this.getState())
	}

	check() {
		if (!this.enabled || this.installing || !['idle', 'error'].includes(this.state.status)) {
			return this.getState()
		}
		this.setState({ status: 'checking' })
		try {
			this.autoUpdater.setFeedURL({ url: this.feedUrl })
			this.autoUpdater.checkForUpdates()
		} catch {
			this.setState({ status: 'error', message: 'Could not check for updates. Please try again later.' })
		}
		return this.getState()
	}

	install({ canInstall, prepareQuit }) {
		if (!this.enabled || this.installing || this.state.status !== 'ready') {
			return false
		}
		// Reserve before calling guards, including against a re-entrant IPC handler.
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
			this.setState({ ...this.state, message: 'Could not restart. Quit and reopen the app to finish updating.' })
			return false
		}
	}
}

module.exports = { DesktopUpdater }
