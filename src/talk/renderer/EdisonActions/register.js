/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { registerWidget } from '@nextcloud/vue/functions/reference'
import { appData } from '../../../app/AppData.js'
import { createActionWidget } from './actionWidget.js'
import { createDesktopTransport } from './desktopTransport.js'

let registered

/** Register before loading Talk's frontend. Context is read lazily once Talk exists. */
export function registerEdisonActionCards() {
	if (registered) {
		return registered
	}
	const widget = createActionWidget({
		getContext: () => ({
			serverUrl: appData.serverUrl,
			accountId: appData.userMetadata?.id,
			token: window.OCA?.Talk?.instance?.$router?.currentRoute?.value?.params?.token,
		}),
		post: createDesktopTransport(),
		confirm: async ({ label }) => window.confirm(`${label}: Bu işlemi gerçekleştirmek istediğinize emin misiniz?`),
	})
	registerWidget('edison_actions_prompt', widget.callback, widget.onDestroy, {
		hasInteractiveView: false,
		fullWidth: false,
		isResizable: false,
	})
	registered = widget
	return widget
}
