/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Persist only display history, never approval or installation authority.
class UpdateNoticeState {
	constructor({ storage, installedVersion }) {
		this.storage = storage
		this.storageKey = `desktop-update-notices:${installedVersion}`
		this.seen = new Set()
		this.visible = false
		this.deferred = false
		try {
			const saved = JSON.parse(storage.getItem(this.storageKey) || '[]')
			if (Array.isArray(saved)) {
				this.seen = new Set(saved.filter((key) => typeof key === 'string').slice(-20))
			}
		} catch { /* Storage may be unavailable; retain in-memory suppression. */ }
	}

	reconcile(state, inCall, manual = false) {
		if (inCall) {
			this.deferred ||= this.visible || manual
			this.visible = false
			return false
		}
		const actionable = ['downloading', 'ready'].includes(state.status)
		const key = `${state.status}:${state.version || ''}`
		if (manual || (actionable && (this.visible || this.deferred || !this.seen.has(key)))) {
			this.visible = true
			this.deferred = false
			if (actionable) {
				this.seen.add(key)
				try {
					this.storage.setItem(this.storageKey, JSON.stringify([...this.seen].slice(-20)))
				} catch { /* No need to block the update if preferences cannot be saved. */ }
			}
		}
		return this.visible
	}

	dismiss() {
		this.visible = false
		this.deferred = false
	}
}

module.exports = { UpdateNoticeState }
