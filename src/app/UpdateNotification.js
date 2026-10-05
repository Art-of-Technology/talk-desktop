/* SPDX-License-Identifier: AGPL-3.0-or-later */

// Keep native notifications separate from installation: a click only opens the UI.
class UpdateNotification {
	constructor({ Notification, canNotify, onClick, title }) {
		Object.assign(this, { Notification, canNotify, onClick, title })
		this.seen = new Set()
	}

	update(state) {
		if (state.status !== 'ready' || !this.canNotify() || !this.Notification.isSupported()) {
			return
		}
		const key = state.version || 'ready'
		if (this.seen.has(key)) {
			return
		}
		try {
			const notification = new this.Notification({
				title: this.title,
				body: 'An update is ready. Open the app to restart and install it.',
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
