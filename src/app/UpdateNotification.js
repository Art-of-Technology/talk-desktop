/* SPDX-License-Identifier: AGPL-3.0-or-later */

// Keep native notifications separate from installation: a click only opens the UI.
class UpdateNotification {
	constructor({ Notification, canNotify, onClick, title }) {
		Object.assign(this, { Notification, canNotify, onClick, title })
		this.seen = new Set()
	}

	update(state) {
		if (!['available', 'ready'].includes(state.status) || !this.canNotify() || !this.Notification.isSupported()) {
			return
		}
		const key = `${state.version || 'update'}:${state.status}`
		if (this.seen.has(key)) {
			return
		}
		try {
			const notification = new this.Notification({
				title: this.title,
				body: state.mandatory
					? 'A required update is available. Open the app to review the deadline and update.'
					: state.status === 'ready'
						? (state.manualInstall ? 'Your update is downloaded. Open the app for Mac installation instructions.' : 'An update is ready. Open the app to restart and install it.')
						: 'A new version is available. Open the app to see what changed and choose whether to update.',
				silent: true,
			})
			notification.on('click', this.onClick)
			notification.show()
			this.current = notification
			this.seen.add(key)
		} catch {
			// Notification delivery is optional; the in-app notice remains available.
		}
	}
}

module.exports = { UpdateNotification }
