/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

/**
 * Execute the real window factory with inert account/UI integrations.
 *
 * @param {typeof import('electron').BrowserWindow} BrowserWindow Native Electron constructor or test host
 */
function loadTalkWindowFactory(BrowserWindow) {
	const output = { exports: {} }
	const noOp = () => {}
	const dependencies = {
		electron: { BrowserWindow },
		'../app/app.tray.js': { setupTray: noOp },
		'../app/AppConfig.ts': { getAppConfig: (key) => key === 'zoomFactor' ? 1 : false },
		'../app/applyContextMenu.js': { applyContextMenu: noOp },
		'../app/downloads.ts': { applyDownloadHandler: noOp },
		'../app/externalLinkHandlers.ts': { applyExternalLinkHandler: noOp },
		'../app/zoom.service.ts': { applyWheelZoom: noOp },
		'../app/utils.ts': {
			getScaledWindowMinSize: (value) => value,
			getScaledWindowSize: (value) => value,
			applyZoom: noOp,
			buildTitle: () => 'Window recreation test',
			getWindowUrl: () => 'data:text/html,<title>Window recreation test</title>',
			getTitleBarSymbolColor: () => '#000000',
		},
		'../constants.js': { TITLE_BAR_HEIGHT: 50 },
		'../shared/build.config.ts': { BUILD_CONFIG: { backgroundColor: '#ffffff' } },
		'../shared/icons.utils.js': { getBrowserWindowIcon: () => undefined },
	}
	vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/talk/talk.window.js'), 'utf8'), {
		module: output,
		require: (id) => {
			if (!(id in dependencies)) {
				throw new Error(`Unexpected factory dependency: ${id}`)
			}
			return dependencies[id]
		},
		TALK_DESKTOP__WINDOW_TALK_PRELOAD_WEBPACK_ENTRY: undefined,
	})
	return output.exports.createTalkWindow
}

module.exports = { loadTalkWindowFactory }
