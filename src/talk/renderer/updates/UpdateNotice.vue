<!--
  - SPDX-FileCopyrightText: 2026 Desktop client contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
  -->

<script setup lang="ts">
import { t } from '@nextcloud/l10n'
import { computed, ref, watch } from 'vue'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcDialogButton from '@nextcloud/vue/components/NcDialogButton'
import { callWindowState } from '../CallWindow/callWindowState.ts'
import { UpdateNoticeState } from './UpdateNoticeState.js'

type UpdateState = { status: string, version?: string, message?: string }
const props = defineProps<{ state: UpdateState }>()
const emit = defineEmits<{ retry: [] }>()
const notice = new UpdateNoticeState({
	storage: {
		getItem: (key: string) => window.localStorage.getItem(key),
		setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
	},
	installedVersion: window.TALK_DESKTOP.packageInfo.version,
})
const visible = ref(false)
const restarting = ref(false)
const feedback = ref('')
const inCall = computed(() => callWindowState.hasCallWindow || callWindowState.isCallWindow)
const title = computed(() => props.state.status === 'ready'
	? t('talk_desktop', 'Update ready to install')
	: props.state.status === 'error'
		? t('talk_desktop', 'Update could not be completed')
		: t('talk_desktop', 'Update available'))

watch([() => props.state, inCall], () => {
	visible.value = notice.reconcile(props.state, inCall.value)
	if (props.state.status === 'error') {
		restarting.value = false
	}
}, { immediate: true })

/** Show the confirmation again after choosing Later. */
function open() {
	feedback.value = ''
	visible.value = notice.reconcile(props.state, inCall.value, true)
	return visible.value
}

/** Dismissing never installs or cancels the background download. */
function dismiss() {
	notice.dismiss()
	visible.value = false
}

/** The main process independently checks call ownership before any restart. */
async function restart() {
	if (restarting.value || inCall.value || props.state.status !== 'ready') {
		return
	}
	restarting.value = true
	feedback.value = ''
	try {
		if (!await window.TALK_DESKTOP.installDesktopUpdate()) {
			restarting.value = false
			feedback.value = t('talk_desktop', 'Could not restart. Finish any active call and try again.')
		}
	} catch {
		restarting.value = false
		feedback.value = t('talk_desktop', 'Could not restart. Please try again.')
	}
}

defineExpose({ open })
</script>

<template>
	<NcDialog
		v-if="visible && !inCall"
		:name="title"
		size="small"
		@update:open="dismiss">
		<div class="update-notice" aria-live="polite">
			<template v-if="state.status === 'ready'">
				<p v-if="state.version">
					{{ t('talk_desktop', 'Version {version} has been downloaded.', { version: state.version }) }}
				</p>
				<p>{{ t('talk_desktop', 'Restart to install the update and reopen the app. Your account and settings will be kept.') }}</p>
				<p>{{ t('talk_desktop', 'If you choose Later, the downloaded update will be applied the next time you quit and reopen the app.') }}</p>
			</template>
			<template v-else-if="state.status === 'downloading'">
				<p>{{ t('talk_desktop', 'Downloading the update in the background. You can keep using the app.') }}</p>
				<progress :aria-label="t('talk_desktop', 'Downloading update')" />
				<p>{{ t('talk_desktop', 'We will let you know when it is ready. The app will not restart automatically.') }}</p>
			</template>
			<p v-else-if="state.status === 'checking'">
				{{ t('talk_desktop', 'Checking for updates…') }}
			</p>
			<p v-else-if="state.status === 'error'">
				{{ t('talk_desktop', 'The update could not be completed. Please try again later.') }}
			</p>
			<p v-else>
				{{ t('talk_desktop', 'No update is available.') }}
			</p>
			<p v-if="restarting">
				{{ t('talk_desktop', 'Restarting to install the update…') }}
			</p>
			<p v-if="feedback" role="alert">
				{{ feedback }}
			</p>
		</div>
		<template #actions>
			<NcDialogButton :label="t('talk_desktop', 'Later')" :disabled="restarting" @click="dismiss" />
			<NcDialogButton
				v-if="state.status === 'ready'"
				variant="primary"
				:label="t('talk_desktop', 'Restart to update')"
				:disabled="restarting || inCall"
				@click="restart" />
			<NcDialogButton
				v-else-if="state.status === 'error'"
				variant="primary"
				:label="t('talk_desktop', 'Retry update check')"
				@click="emit('retry')" />
		</template>
	</NcDialog>
</template>

<style scoped>
.update-notice {
	display: grid;
	gap: 12px;
	padding: 12px;
}
progress {
	width: 100%;
}
</style>
