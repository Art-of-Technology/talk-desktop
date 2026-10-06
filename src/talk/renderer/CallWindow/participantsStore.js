/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { showInfo } from '@nextcloud/dialogs'
import participantsStore from '@talk/src/store/participantsStore.js'
import { localCallParticipantModel, localMediaModel } from '@talk/src/utils/webrtc/index.js'
import { createCallWindowActions } from './callWindowActions.js'

export default {
	...participantsStore,
	actions: createCallWindowActions(participantsStore.actions, {
		claim: (token) => window.TALK_DESKTOP.claimCallWindow(token),
		release: () => window.TALK_DESKTOP.releaseCallWindow(),
		denied: () => showInfo('Your call is already open in a separate window.'),
		isMediaSettled: () => !localMediaModel.get('localStream')
			&& !localMediaModel.get('localScreen')
			&& !localCallParticipantModel.get('peer')
			&& !localCallParticipantModel.get('screenPeer')
			&& !(localMediaModel.getWebRtc()?.webrtc?.peers?.length),
	}),
}
