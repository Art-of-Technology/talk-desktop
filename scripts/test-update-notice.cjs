/* SPDX-License-Identifier: AGPL-3.0-or-later */
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { UpdateNoticeState } = require('../src/talk/renderer/updates/UpdateNoticeState.js')

/** Create isolated persistent preferences for notice lifecycle tests. */
function fixture() {
	const values = new Map()
	const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) }
	const create = () => new UpdateNoticeState({ storage, installedVersion: '2.3.4' })
	return { create, notice: create() }
}

test('background checking and failures never interrupt users with a dialog', () => {
	const { notice } = fixture()
	for (const status of ['idle', 'checking', 'error', 'disabled', 'unsupported']) {
		assert.equal(notice.reconcile({ status }, false), false)
	}
})

test('download announces availability once; Later does not suppress ready confirmation', () => {
	const { notice } = fixture()
	assert.equal(notice.reconcile({ status: 'downloading' }, false), true)
	notice.dismiss()
	assert.equal(notice.reconcile({ status: 'downloading' }, false), false)
	assert.equal(notice.reconcile({ status: 'ready', version: '2.3.5' }, false), true)
	notice.dismiss()
	assert.equal(notice.reconcile({ status: 'ready', version: '2.3.5' }, false), false)
})

test('renderer recreation and force reload do not repeat a dismissed version', () => {
	const { notice, create } = fixture()
	notice.reconcile({ status: 'ready', version: '2.3.5' }, false)
	notice.dismiss()
	const recreated = create()
	assert.equal(recreated.reconcile({ status: 'ready', version: '2.3.5' }, false), false)
	assert.equal(recreated.reconcile({ status: 'ready', version: '2.3.6' }, false), true)
})

test('new notices wait until a call finishes, including manual toast requests', () => {
	const { notice } = fixture()
	const ready = { status: 'ready', version: '2.3.5' }
	assert.equal(notice.reconcile(ready, true), false)
	assert.equal(notice.reconcile(ready, false), true)
	notice.dismiss()
	assert.equal(notice.reconcile(ready, true, true), false)
	assert.equal(notice.reconcile(ready, false), true)
})

test('a new call hides an open notice and restores it after leaving', () => {
	const { notice } = fixture()
	const ready = { status: 'ready', version: '2.3.5' }
	assert.equal(notice.reconcile(ready, false), true)
	assert.equal(notice.reconcile(ready, true), false)
	assert.equal(notice.reconcile(ready, false), true)
})

test('menu can reopen a dismissed notice without checking or installing', () => {
	const { notice } = fixture()
	const ready = { status: 'ready', version: '2.3.5' }
	notice.reconcile(ready, false)
	notice.dismiss()
	assert.equal(notice.reconcile(ready, false, true), true)
})

test('download failure remains visible in an already open notice', () => {
	const { notice } = fixture()
	notice.reconcile({ status: 'downloading' }, false)
	assert.equal(notice.reconcile({ status: 'error' }, false), true)
})

test('unavailable storage does not prevent notices or in-memory suppression', () => {
	const fail = () => {
		throw new Error('Storage blocked')
	}
	const notice = new UpdateNoticeState({ storage: { getItem: fail, setItem: fail }, installedVersion: '2.3.4' })
	const ready = { status: 'ready' }
	assert.equal(notice.reconcile(ready, false), true)
	notice.dismiss()
	assert.equal(notice.reconcile(ready, false), false)
})
