/** SPDX-License-Identifier: AGPL-3.0-or-later */
export interface DesktopRelease {
	version: string
	title: string
	summary: string[]
	sections: { heading: string, body: string, images: { url: string, alt: string, caption?: string }[] }[]
}

export interface DesktopUpdateState {
	status: string
	version?: string
	message?: string
	release?: DesktopRelease
	mandatory?: boolean
	deadline?: number
	expired?: boolean
	persistenceFailed?: boolean
	whatsNew?: DesktopRelease
	currentRelease?: DesktopRelease
}
