/* SPDX-License-Identifier: AGPL-3.0-or-later */
import { registerWidget } from '@nextcloud/vue/functions/reference'
import { appData } from '../../../app/AppData.js'
import { createCardTransport, createCardWidget } from './cardWidget.js'
import renderer from './vendor/notification-card.js'

import './vendor/notification-card.css'
let registered
/**
 *
 */
export function registerNotificationCards() {
	if (registered) {
		return registered
	}
	registered = createCardWidget({
		getContext: () => ({ serverUrl: appData.serverUrl, accountId: appData.userMetadata?.id, token: window.OCA?.Talk?.instance?.$router?.currentRoute?.value?.params?.token }),
		request: createCardTransport(),
		render: renderer.render,
	})
	registerWidget('workspace_notification_card', registered.callback, registered.onDestroy, { hasInteractiveView: false, fullWidth: true, isResizable: false })
	return registered
}
