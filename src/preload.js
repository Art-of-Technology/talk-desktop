/**
 * SPDX-FileCopyrightText: 2022 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

const {
	contextBridge,
	ipcRenderer,
} = require('electron')
const { version, license, bugs, repository } = require('../package.json')

const packageInfo = {
	version,
	license,
	bugs,
	repository: repository.url,
}

/**
 * @global
 */
const TALK_DESKTOP = {
	/**
	 * Subset of package.json meta-data
	 *
	 * @type {typeof packageInfo} packageInfo
	 */
	packageInfo,
	/**
	 * Build a title for the window from base (product name) and release channel
	 *
	 * @param {string} [title] - Window title if any
	 * @return {Promise<string>} - Full window title with base and release channel
	 */
	buildTitle: (title) => ipcRenderer.invoke('app:buildTitle', title),
	/**
	 * Quit the application
	 */
	quit: () => ipcRenderer.send('app:quit'),
	/**
	 * Get system information such as OS version or installation properties
	 *
	 * @return {Promise<import('./app/system.utils.ts').OsVersion>}
	 */
	getSystemInfo: () => ipcRenderer.invoke('app:getSystemInfo'),
	/**
	 * Get system locale and preferred language
	 *
	 * @return {Promise<{ locale: string, language: string }>}
	 */
	getSystemL10n: () => ipcRenderer.invoke('app:getSystemL10n'),
	/**
	 * Get whether (prefers-contrast: more) should match
	 *
	 * @return {boolean} - whether (prefers-contrast: more) should match
	 */
	getPrefersContrastMore: () => ipcRenderer.sendSync('app:prefersContrastMore:get'),
	/**
	 * Subscribe on (prefers-contrast: more) change
	 *
	 * @param {(value: boolean) => void} callback - Callback to be called when (prefers-contrast: more) changes
	 * @return {() => void} - Unsubscribe
	 */
	onPrefersContrastMoreChange: (callback) => {
		const handler = (event, value) => callback(value)
		ipcRenderer.on('app:prefersContrastMore:change', handler)
		return () => ipcRenderer.removeListener('app:prefersContrastMore:change', handler)
	},
	/**
	 * Enable web request intercepting
	 *
	 * @type {typeof import('./app/webRequestInterceptor').enableWebRequestInterceptor}
	 */
	enableWebRequestInterceptor: (...args) => ipcRenderer.invoke('app:enableWebRequestInterceptor', ...args),
	/**
	 * Disable web request intercepting
	 *
	 * @type {typeof import('./app/webRequestInterceptor').disableWebRequestInterceptor}
	 */
	disableWebRequestInterceptor: (...args) => ipcRenderer.invoke('app:disableWebRequestInterceptor', ...args),
	/**
	 * Set or remove notifications badge
	 *
	 * @param {number} [count] - Count of notification or 0 to disable
	 * @return {Promise<void>}
	 */
	setBadgeCount: (count) => ipcRenderer.invoke('app:setBadgeCount', count),
	/**
	 * Start or stop flashing (on Windows) or bouncing (on Mac) of app icon
	 *
	 * @param {boolean} shouldFlash - True to enable, false to disable
	 */
	flashAppIcon: (shouldFlash) => ipcRenderer.send('talk:flashAppIcon', shouldFlash),
	/**
	 * Get available desktop capture sources: screens and windows
	 *
	 * @return {Promise<{ id: string, name: string, icon?: string }[]|null>}
	 */
	getDesktopCapturerSources: () => ipcRenderer.invoke('app:getDesktopCapturerSources'),
	/**
	 * Relaunch an entire application
	 */
	relaunch: () => ipcRenderer.send('app:relaunch'),
	/**
	 * Relaunch the main window without relaunching an entire application
	 */
	relaunchWindow: () => ipcRenderer.send('app:relaunchWindow'),
	/**
	 * Get an application config value by key
	 *
	 * @param {string} [key] - Config key
	 * @return {Promise<Record<string, unknown> | unknown>}
	 */
	getAppConfig: (key) => ipcRenderer.invoke('app:config:get', key),
	/**
	 * Set an application config value by key
	 *
	 * @param {string} key - Config key
	 * @param {any} [value] - Config value
	 * @return {Promise<void>}
	 */
	setAppConfig: (key, value) => ipcRenderer.invoke('app:config:set', key, value),
	/**
	 * Listen for changes in the application config
	 *
	 * @param {(event: import('electron').IpcRedererEvent, payload: { key: string, value: unknown, appConfig: import('./app/AppConfig.ts').AppConfig}) => void} callback - Callback
	 */
	onAppConfigChange: (callback) => ipcRenderer.on('app:config:change', callback),
	/**
	 * Grant a permission requiring a user gesture
	 *
	 * @param {string} id - Button ID to click on
	 */
	grantUserGesturedPermission: (id) => ipcRenderer.send('app:grantUserGesturedPermission', id),
	/**
	 * Trigger download of a URL
	 *
	 * @param {string} url - URL to download
	 * @param {string} [filename] - Filename suggestion for the download
	 */
	downloadURL: (url, filename) => ipcRenderer.send('app:downloadURL', url, filename),
	/**
	 * Open developer tools
	 */
	toggleDevTools: () => ipcRenderer.send('app:toggleDevTools'),
	/**
	 * Invoke app:anything
	 *
	 * @param {...any} args - Arguments
	 */
	invokeAnything: (...args) => ipcRenderer.invoke('app:anything', ...args),
	/**
	 * Open chrome://webrtc-internals
	 */
	openChromeWebRtcInternals: () => ipcRenderer.send('app:openChromeWebRtcInternals'),
	/**
	 * Send appData to main process on restore
	 *
	 * @param {object} appDataDto appData as plain object
	 */
	sendAppData: (appDataDto) => ipcRenderer.send('appData:receive', appDataDto),
	/**
	 * Get appData from main process
	 *
	 * @return {Promise<import('./AppData.js').appData>}
	 */
	getAppData: () => ipcRenderer.invoke('appData:get'),
	/**
	 * Open a web-view modal window with Nextcloud Server login page
	 *
	 * @param {string} server - Server URL
	 * @param {string} [user] - Preset User ID
	 * @return {Promise<import('./authentication/loginFlowV1.service.ts').Credentials|Error>}
	 */
	openLoginWebView: (server, user) => ipcRenderer.invoke('authentication:openLoginWebView', server, user),
	/**
	 * Open main window after logging in
	 *
	 * @param {import('./AppData.js').appData} appData - AppData
	 * @return {Promise<void>}
	 */
	login: (appData) => ipcRenderer.invoke('authentication:login', appData),
	/**
	 * Logout and open accounts window
	 *
	 * @return {Promise<void>}
	 */
	logout: () => ipcRenderer.invoke('authentication:logout'),
	/**
	 * Focus and restore the talk window
	 *
	 * @return {Promise<void>}
	 */
	focusTalk: () => ipcRenderer.invoke('talk:focus'),
	/**
	 * Reserve this renderer as the call window without reloading its media session.
	 *
	 * @param {string} token - Conversation token
	 * @return {Promise<boolean>}
	 */
	claimCallWindow: (token) => ipcRenderer.invoke('call:claim', token),
	/**
	 * Get this window's current call ownership.
	 *
	 * @return {Promise<{ isCallWindow: boolean, hasCallWindow: boolean }>}
	 */
	getCallWindowState: () => ipcRenderer.invoke('call:state'),
	/**
	 * Restore the existing call window.
	 *
	 * @return {Promise<boolean>}
	 */
	focusCallWindow: () => ipcRenderer.invoke('call:focus'),
	/**
	 * Observe window ownership without exposing Electron's IPC event.
	 *
	 * @param {(state: { isCallWindow: boolean, hasCallWindow: boolean }) => void} callback - Receives the current window state
	 * @return {() => void} Unsubscribe
	 */
	onCallWindowStateChange: (callback) => {
		const handler = (event, state) => callback(state)
		ipcRenderer.on('call:state-changed', handler)
		return () => ipcRenderer.removeListener('call:state-changed', handler)
	},
	/**
	 * Release ownership after Talk has confirmed that the call ended.
	 *
	 * @return {Promise<void>}
	 */
	releaseCallWindow: () => ipcRenderer.invoke('call:release'),
	/**
	 * Handle an explicit request to leave through Talk's normal call action.
	 *
	 * @param {() => void} callback - Leave handler
	 * @return {() => void} Unsubscribe
	 */
	onCallLeaveRequested: (callback) => {
		const handler = () => callback()
		ipcRenderer.on('call:leave-requested', handler)
		return () => ipcRenderer.removeListener('call:leave-requested', handler)
	},
	/**
	 * Show the callbox window
	 *
	 * @param {object} params - Callbox parameters
	 */
	showCallbox: (params) => ipcRenderer.send('callbox:show', params),
	/**
	 * Show the help window (aka About)
	 *
	 * @return {Promise<void>}
	 */
	showHelp: () => ipcRenderer.invoke('help:show'),
	/**
	 * Read this installation's update state.
	 *
	 * @return {Promise<import('./talk/renderer/updates/types.ts').DesktopUpdateState>}
	 */
	getDesktopUpdateState: () => ipcRenderer.invoke('desktop-update:state'),
	/** Check release metadata without downloading an installer. */
	checkDesktopUpdate: () => ipcRenderer.invoke('desktop-update:check'),
	/** Consent to download the offered, validated release. */
	downloadDesktopUpdate: () => ipcRenderer.invoke('desktop-update:download'),
	/** Reveal only the main process's verified Mac installer; accepts no path. */
	revealDesktopUpdate: () => ipcRenderer.invoke('desktop-update:reveal'),
	/**
	 * Explicitly acknowledge the installed version's release notes.
	 *
	 * @param {string} version - Exact installed release version
	 */
	acknowledgeDesktopRelease: (version) => ipcRenderer.invoke('desktop-update:acknowledge-notes', version),
	/** Report that the main window can display the required update notice. */
	desktopUpdateNoticeShown: () => ipcRenderer.invoke('desktop-update:notice-shown'),
	/** Quit this application from a mandatory update notice. */
	quitForDesktopUpdate: () => ipcRenderer.invoke('desktop-update:quit'),
	/** Apply the downloaded update when the main process confirms it is safe. */
	installDesktopUpdate: () => ipcRenderer.invoke('desktop-update:install'),
	/**
	 * Open the update notice after a native notification click.
	 *
	 * @param {() => void} callback - Callback
	 * @return {() => void} unsubscribe
	 */
	onDesktopUpdateShow: (callback) => {
		const handler = () => callback()
		ipcRenderer.on('desktop-update:show', handler)
		return () => ipcRenderer.removeListener('desktop-update:show', handler)
	},
	/**
	 * Listen for update progress.
	 *
	 * @param {(state: object) => void} callback - Callback
	 * @return {() => void} unsubscribe
	 */
	onDesktopUpdateState: (callback) => {
		const handler = (event, state) => callback(state)
		ipcRenderer.on('desktop-update:state', handler)
		return () => ipcRenderer.removeListener('desktop-update:state', handler)
	},
	/**
	 * Show the upgrade window
	 *
	 * @return {Promise<void>}
	 */
	showUpgrade: () => ipcRenderer.invoke('upgrade:show'),
	/**
	 * Accept (or reject) untrusted certificate
	 *
	 * @param {boolean} isAccepted - Is the certificate accepted as trusted
	 */
	acceptCertificate: (isAccepted) => ipcRenderer.send('certificate:accept', isAccepted),
	/**
	 * Verify certificate on a URL
	 *
	 * @param {string} url - URL
	 * @return {Promise<boolean>}
	 */
	verifyCertificate: (url) => ipcRenderer.invoke('certificate:verify', url),
}

// Set global window.TALK_DESKTOP
contextBridge.exposeInMainWorld('TALK_DESKTOP', TALK_DESKTOP)
