const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
/* SPDX-License-Identifier: AGPL-3.0-or-later */
const test = require('node:test')
const { UpdateNotification } = require('../src/app/UpdateNotification.js')

test('ready notification defers through calls, deduplicates, and click only opens UI', () => {
	const shown = []
	let eligible = false
	let opened = 0
	class Notification extends EventEmitter {
		static isSupported() { return true }
		constructor(options) {
			super()
			this.options = options
		}

		show() { shown.push(this) }
	}
	const notices = new UpdateNotification({ Notification, title: 'Talk', canNotify: () => eligible, onClick: () => opened++ })
	notices.update({ status: 'ready', version: '2.3.4' })
	assert.equal(shown.length, 0)
	eligible = true
	notices.update({ status: 'downloading' })
	assert.equal(shown.length, 0)
	notices.update({ status: 'ready', version: '2.3.4' })
	notices.update({ status: 'ready', version: '2.3.4' })
	assert.equal(shown.length, 1)
	assert.equal(shown[0].options.silent, true)
	shown[0].emit('click')
	assert.equal(opened, 1)
	notices.update({ status: 'ready', version: '2.3.5' })
	assert.equal(shown.length, 2)
	notices.update({ status: 'available', version: '2.3.6' })
	assert.equal(shown.length, 3)
	assert.match(shown[2].options.body, /choose whether to update/)
	shown[2].emit('click')
	assert.equal(opened, 2)
	notices.update({ status: 'ready', version: '2.3.6' })
	assert.equal(shown.length, 4)
	notices.update({ status: 'available', version: '2.3.7', mandatory: true })
	assert.match(shown[4].options.body, /required update/)
})

test('unsupported or failed native notification never breaks updater state', () => {
	const unsupported = new UpdateNotification({ Notification: { isSupported: () => false }, canNotify: () => true })
	assert.doesNotThrow(() => unsupported.update({ status: 'ready' }))
	class Failing {
		static isSupported() { return true }
		constructor() { throw new Error('Unavailable') }
	}
	const failed = new UpdateNotification({ Notification: Failing, canNotify: () => true })
	assert.doesNotThrow(() => failed.update({ status: 'ready' }))
	assert.equal(failed.seen.size, 0)
})
