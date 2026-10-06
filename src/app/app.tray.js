/**
 * SPDX-FileCopyrightText: 2023 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const { app, Tray, Menu } = require('electron')
const path = require('node:path')
const { getTrayIcon } = require('../shared/icons.utils.js')

let isAppQuitting = false
const trayOwners = new WeakMap()

/**
 * Release tray ownership without closing the associated renderer.
 *
 * @param {import('electron').BrowserWindow} browserWindow Previous main window
 */
function releaseTray(browserWindow) {
	trayOwners.get(browserWindow)?.()
}

/**
 * Restore normal minimize-to-tray behavior after a canceled quit.
 */
function cancelTrayQuit() {
	isAppQuitting = false
}

/** Allow the updater to close windows before Electron emits before-quit. */
function prepareTrayQuit() {
	isAppQuitting = true
}

/**
 * Allow quitting the app if requested. It minimizes to a tray otherwise.
 */
app.on('before-quit', () => {
	isAppQuitting = true
})

/**
 * Setup tray with an icon that provides a context menu.
 *
 * @param {import('electron').BrowserWindow} browserWindow Browser window, associated with the tray
 * @return {import('electron').Tray} Tray instance
 */
function setupTray(browserWindow) {
	releaseTray(browserWindow)
	const icon = path.resolve(__dirname, getTrayIcon())
	const tray = new Tray(icon)
	tray.setToolTip(app.name)
	tray.setContextMenu(Menu.buildFromTemplate([
		{
			label: 'Open',
			click: () => browserWindow.show(),
		},
		{
			role: 'quit',
		},
	]))
	tray.on('click', () => browserWindow.show())

	const onClose = (event) => {
		if (!isAppQuitting) {
			event.preventDefault()
			browserWindow.hide()
		}
	}
	browserWindow.on('close', onClose)

	const dispose = () => {
		browserWindow.removeListener('close', onClose)
		browserWindow.removeListener('closed', dispose)
		trayOwners.delete(browserWindow)
		tray.destroy()
	}
	browserWindow.on('closed', dispose)
	trayOwners.set(browserWindow, dispose)

	return tray
}

module.exports = {
	setupTray,
	releaseTray,
	cancelTrayQuit,
	prepareTrayQuit,
}
