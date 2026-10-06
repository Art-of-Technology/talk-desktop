/* SPDX-License-Identifier: AGPL-3.0-or-later */

/**
 * Close only this process's windows/media; do not let tray/call prompts veto a deadline.
 *
 * @param {object} root0 Injected process-owned shutdown operations.
 * @param {object} root0.app Electron app.
 * @param {() => object[]} root0.getWindows Current process windows.
 * @param {() => void} root0.prepareQuit Disable tray interception.
 * @param {() => void} root0.markQuitting Mark shutdown in progress.
 */
function createMandatoryShutdown({ app, getWindows, prepareQuit, markQuitting }) {
	let closing = false
	return () => {
		if (closing) {
			return
		}
		closing = true
		try {
			markQuitting()
			try {
				prepareQuit()
			} catch { /* Destroying owned windows and exiting remain mandatory. */ }
			for (const window of getWindows()) {
				try {
					if (!window.isDestroyed()) {
						window.destroy()
					}
				} catch { /* Exit still stops media. */ }
			}
		} finally {
			app.exit(0)
		}
	}
}

module.exports = { createMandatoryShutdown }
