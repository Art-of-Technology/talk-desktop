/* SPDX-License-Identifier: AGPL-3.0-or-later */

// Notification callbacks can outlive the renderer's promotion into a call.
class NotificationNavigation {
	constructor({ getMain, focusMain, trusted, serverUrl, account }) {
		Object.assign(this, { getMain, focusMain, trusted, serverUrl, account })
		this.ready = new WeakSet()
		this.watched = new WeakSet()
	}

	open(event, link) {
		if (!this.trusted(event) || typeof link !== 'string') {
			return false
		}
		let route
		try {
			const server = new URL(this.serverUrl())
			const url = new URL(link, server)
			const base = server.pathname.replace(/\/$/, '')
			const pathname = url.pathname.slice(base.length).replace(/^\/index\.php\//, '/')
			if (url.origin !== server.origin || url.username || url.password
				|| !url.pathname.startsWith(base + '/') || !/^\/call\/[a-zA-Z0-9_-]{1,128}$/.test(pathname)) {
				return false
			}
			route = pathname + url.search + url.hash
		} catch {
			return false
		}
		this.focusMain()
		this.pending = { event, route, target: this.getMain(), account: this.account() }
		this.flush()
		return true
	}

	markReady(event) {
		if (!this.trusted(event) || event.sender !== this.getMain()?.webContents) {
			return false
		}
		const contents = event.sender
		if (!this.watched.has(contents)) {
			this.watched.add(contents)
			contents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
				if (isMainFrame && !isInPlace) {
					this.ready.delete(contents)
				}
			})
		}
		this.ready.add(contents)
		this.flush()
		return true
	}

	flush() {
		if (!this.pending) {
			return
		}
		if (!this.trusted(this.pending.event) || this.pending.account !== this.account()
			|| this.pending.target !== this.getMain()) {
			this.pending = undefined
			return
		}
		const target = this.getMain()
		if (!target || target.isDestroyed() || !this.ready.has(target.webContents)) {
			return
		}
		target.webContents.send('talk:notification-route', this.pending.route)
		this.pending = undefined
	}

	clear() {
		this.pending = undefined
	}
}

module.exports = { NotificationNavigation }
