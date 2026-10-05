/**
 * SPDX-FileCopyrightText: 2026 Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Dependencies are injected so ownership and close races can be tested without Electron.
class CallWindowManager {
	constructor({ getMain, setMain, createMain, releaseTray, restoreTray, showMain, confirmLeave, onPromote = () => {}, onLeaveTimeout = () => {}, leaveTimeout = 15000 }) {
		Object.assign(this, { getMain, setMain, createMain, releaseTray, restoreTray, showMain, confirmLeave, onPromote, onLeaveTimeout, leaveTimeout })
		this.owner = null
		this.pendingLeave = null
	}

	state(sender) {
		return { isCallWindow: this.owner?.webContents === sender, hasCallWindow: !!this.owner }
	}

	trusted(sender) {
		return sender === this.getMain()?.webContents || sender === this.owner?.webContents
	}

	focusCall() {
		if (!this.owner || this.owner.isDestroyed()) {
			return false
		}
		if (this.owner.isMinimized?.()) {
			this.owner.restore()
		}
		this.owner.show()
		this.owner.focus()
		return true
	}

	broadcast() {
		for (const window of new Set([this.getMain(), this.owner])) {
			if (window && !window.isDestroyed()) {
				window.webContents.send('call:state-changed', this.state(window.webContents))
			}
		}
	}

	claim(sender, token) {
		if (!this.trusted(sender) || typeof token !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(token)) {
			return false
		}
		if (this.owner) {
			if (this.owner.webContents === sender) {
				return true
			}
			this.focusCall()
			return false
		}
		const owner = this.getMain()
		this.owner = owner // Reserve synchronously before creating another renderer.
		this.releaseTray(owner)
		try {
			this.setMain(this.createMain())
		} catch (error) {
			this.owner = null
			this.restoreTray(owner)
			throw error
		}
		this.onPromote(owner)
		owner.on('close', (event) => {
			if (this.owner !== owner) {
				return
			}
			event.preventDefault()
			void this.endCall()
		})
		owner.once('closed', () => {
			if (this.owner !== owner) {
				return
			}
			this.owner = null
			this.finishLeave(true)
			this.broadcast()
		})
		owner.webContents.once('render-process-gone', () => {
			if (this.owner === owner) {
				this.release(owner.webContents)
			}
		})
		this.broadcast()
		this.focusCall()
		return true
	}

	release(sender) {
		if (!this.owner || this.owner.webContents !== sender) {
			return false
		}
		const owner = this.owner
		this.owner = null
		this.finishLeave(true)
		this.broadcast()
		this.showMain()
		// Let Electron deliver the invoke response before disposing the renderer.
		setImmediate(() => {
			if (!owner.isDestroyed()) {
				owner.destroy()
			}
		})
		return true
	}

	finishLeave(result) {
		if (!this.pendingLeave) {
			return
		}
		clearTimeout(this.pendingLeave.timer)
		this.pendingLeave.resolve(result)
		this.pendingLeave = null
	}

	endCall() {
		if (!this.owner) {
			return Promise.resolve(true)
		}
		if (this.pendingLeave) {
			return this.pendingLeave.promise
		}
		const owner = this.owner
		let resolve
		const promise = new Promise((done) => {
			resolve = done
		})
		const pending = { promise, resolve }
		this.pendingLeave = pending
		Promise.resolve().then(() => this.confirmLeave(owner)).then((accepted) => {
			if (this.owner !== owner || this.pendingLeave !== pending) {
				return
			}
			if (!accepted) {
				return this.finishLeave(false)
			}
			this.pendingLeave.timer = setTimeout(async () => {
				let forceClose = false
				try {
					forceClose = await this.onLeaveTimeout(owner)
				} catch {
					// Keep the call open if the native confirmation fails.
				}
				if (this.owner !== owner || this.pendingLeave !== pending) {
					return
				}
				if (forceClose === true) {
					// Explicit local shutdown: destroys media tracks even without server acknowledgement.
					owner.destroy()
					this.showMain()
				} else {
					this.finishLeave(false)
				}
			}, this.leaveTimeout)
			owner.webContents.send('call:leave-requested')
		}).catch(() => {
			if (this.pendingLeave === pending) {
				this.finishLeave(false)
			}
		})
		return promise
	}
}

module.exports = { CallWindowManager }
