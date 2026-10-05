<!--
  - SPDX-FileCopyrightText: 2024 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
  -->

<script setup lang="ts">
import type { Ref } from 'vue'

import { t } from '@nextcloud/l10n'
import { generateUrl } from '@nextcloud/router'
import { computed, inject, onBeforeMount, onBeforeUnmount, ref } from 'vue'
import NcActionButton from '@nextcloud/vue/components/NcActionButton'
import NcActionLink from '@nextcloud/vue/components/NcActionLink'
import NcActions from '@nextcloud/vue/components/NcActions'
import NcActionSeparator from '@nextcloud/vue/components/NcActionSeparator'
import IconBugOutline from 'vue-material-design-icons/BugOutline.vue'
import IconCloudDownloadOutline from 'vue-material-design-icons/CloudDownloadOutline.vue'
import IconCogOutline from 'vue-material-design-icons/CogOutline.vue'
import IconInformationOutline from 'vue-material-design-icons/InformationOutline.vue'
import IconMenu from 'vue-material-design-icons/Menu.vue'
import IconReload from 'vue-material-design-icons/Reload.vue'
import IconWeb from 'vue-material-design-icons/Web.vue'
import UpdateNotice from '../../updates/UpdateNotice.vue'
import UiDotBadge from './UiDotBadge.vue'
import { BUILD_CONFIG } from '../../../../shared/build.config.ts'
import { getCurrentTalkRoutePath } from '../../TalkWrapper/talk.service.ts'

const packageInfo = window.TALK_DESKTOP.packageInfo

const isTalkInitialized = inject<Ref<boolean>>('talk:isInitialized')

const showHelp = () => window.TALK_DESKTOP.showHelp()
const reload = () => window.location.reload()
const openSettings = () => window.OCA.Talk.Settings.open()
const openInWeb = () => window.open(generateUrl(getCurrentTalkRoutePath()), '_blank')

type UpdateState = Awaited<ReturnType<typeof window.TALK_DESKTOP.getDesktopUpdateState>>
const updateState = ref<UpdateState>({ status: 'idle' })
const updateFeedback = ref('')
const updateNotice = ref<InstanceType<typeof UpdateNotice>>()
let receivedUpdateEvent = false
const updateDisabled = computed(() => ['checking', 'disabled', 'unsupported'].includes(updateState.value.status))
const updateLabel = computed(() => {
	switch (updateState.value.status) {
		case 'checking': return t('talk_desktop', 'Checking for updates…')
		case 'downloading': return t('talk_desktop', 'Downloading update…')
		case 'ready': return t('talk_desktop', 'Restart to update')
		case 'error': return t('talk_desktop', 'Retry update check')
		case 'disabled': return t('talk_desktop', 'Updates not configured')
		case 'unsupported': return t('talk_desktop', 'Manual updates only')
		default: return t('talk_desktop', 'Check for updates')
	}
})

onBeforeMount(async () => {
	try {
		const state = await window.TALK_DESKTOP.getDesktopUpdateState()
		if (!receivedUpdateEvent) {
			updateState.value = state
		}
	} catch {
		updateFeedback.value = t('talk_desktop', 'Could not read update status. Please try again.')
	}
})
const unsubscribeUpdateState = window.TALK_DESKTOP.onDesktopUpdateState((state: UpdateState) => {
	receivedUpdateEvent = true
	updateState.value = state
	updateFeedback.value = ''
	if (state.status === 'idle' && state.message) {
		updateFeedback.value = t('talk_desktop', 'No update is available.')
	}
	if (state.status === 'error') {
		updateFeedback.value = t('talk_desktop', 'The update could not be completed. Please try again later.')
	}
})
onBeforeUnmount(unsubscribeUpdateState)
const unsubscribeUpdateShow = window.TALK_DESKTOP.onDesktopUpdateShow(() => updateNotice.value?.open())
onBeforeUnmount(unsubscribeUpdateShow)

/**
 * Check for a fork release or restart to apply a downloaded update.
 */
async function update() {
	updateFeedback.value = ''
	try {
		if (['ready', 'downloading'].includes(updateState.value.status)) {
			if (!updateNotice.value?.open()) {
				updateFeedback.value = t('talk_desktop', 'Finish your call before opening the update dialog.')
			}
		} else {
			updateState.value = await window.TALK_DESKTOP.checkDesktopUpdate()
			if (updateState.value.status === 'idle') {
				updateFeedback.value = t('talk_desktop', 'No update is available.')
			} else if (updateState.value.status === 'error') {
				updateFeedback.value = t('talk_desktop', 'The update could not be completed. Please try again later.')
			}
		}
	} catch {
		updateFeedback.value = t('talk_desktop', 'The update could not be completed. Please try again later.')
	}
}
</script>

<template>
	<NcActions
		:aria-label="t('talk_desktop', 'Menu')"
		variant="tertiary-no-background"
		container="body">
		<template #icon>
			<UiDotBadge insetInlineEnd="10%" :enabled="updateState.status === 'ready'">
				<IconMenu :size="20" fillColor="var(--color-background-plain-text)" />
			</UiDotBadge>
		</template>

		<NcActionButton :disabled="updateDisabled" @click="update">
			<template #icon>
				<IconCloudDownloadOutline :size="20" />
			</template>
			{{ updateLabel }}
		</NcActionButton>
		<NcActionButton v-if="updateFeedback" disabled>
			{{ updateFeedback }}
		</NcActionButton>
		<NcActionSeparator />

		<template v-if="isTalkInitialized">
			<NcActionButton closeAfterClick @click="openInWeb">
				<template #icon>
					<IconWeb :size="20" />
				</template>
				{{ t('talk_desktop', 'Open in web browser') }}
			</NcActionButton>

			<NcActionSeparator />
		</template>

		<NcActionButton @click="reload">
			<template #icon>
				<IconReload :size="20" />
			</template>
			{{ t('talk_desktop', 'Force reload') }}
		</NcActionButton>
		<NcActionLink
			v-if="!BUILD_CONFIG.isBranded"
			:href="packageInfo.bugs.create"
			target="_blank"
			closeAfterClick>
			<template #icon>
				<IconBugOutline :size="20" />
			</template>
			{{ t('talk_desktop', 'Report a bug') }}
		</NcActionLink>

		<NcActionSeparator />

		<NcActionButton closeAfterClick @click="openSettings">
			<template #icon>
				<IconCogOutline :size="20" />
			</template>
			{{ t('talk_desktop', 'App settings') }}
		</NcActionButton>
		<NcActionButton closeAfterClick @click="showHelp">
			<template #icon>
				<IconInformationOutline :size="20" />
			</template>
			{{ t('talk_desktop', 'About') }}
		</NcActionButton>
	</NcActions>
	<UpdateNotice ref="updateNotice" :state="updateState" @retry="update" />
</template>
