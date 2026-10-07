<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script setup lang="ts">
import type { DesktopRelease, DesktopUpdateState } from './types.ts'

import { t } from '@nextcloud/l10n'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import NcDialog from '@nextcloud/vue/components/NcDialog'
import NcDialogButton from '@nextcloud/vue/components/NcDialogButton'
import { callWindowState } from '../CallWindow/callWindowState.ts'
import { UpdateNoticeState } from './UpdateNoticeState.js'

const props = defineProps<{ state: DesktopUpdateState }>()
const emit = defineEmits<{ retry: [] }>()
const notice = new UpdateNoticeState({
	storage: {
		getItem: (key: string) => window.localStorage.getItem(key),
		setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
	},
	installedVersion: window.TALK_DESKTOP.packageInfo.version,
})
const visible = ref(false)
const notesVisible = ref(false)
const installedNotes = ref<DesktopRelease>()
const restarting = ref(false)
const downloading = ref(false)
const acknowledging = ref(false)
const feedback = ref('')
const failedImages = ref(new Set<string>())
const clock = ref(Date.now())
const timer = setInterval(() => {
	clock.value = Date.now()
}, 1000)
onBeforeUnmount(() => clearInterval(timer))
const inCall = computed(() => callWindowState.hasCallWindow || callWindowState.isCallWindow)
const isMainWindow = computed(() => !callWindowState.isCallWindow)
const remaining = computed(() => Math.max(0, Math.ceil(((props.state.deadline ?? clock.value) - clock.value) / 1000)))
const countdown = computed(() => `${Math.floor(remaining.value / 60)}:${String(remaining.value % 60).padStart(2, '0')}`)
const title = computed(() => props.state.mandatory
	? t('talk_desktop', 'Required update')
	: props.state.status === 'ready'
		? (props.state.manualInstall ? t('talk_desktop', 'Install your downloaded update') : t('talk_desktop', 'Ready to update'))
		: t('talk_desktop', 'A new version is available'))

watch([() => props.state, inCall, isMainWindow], () => {
	visible.value = isMainWindow.value && notice.reconcile(props.state, inCall.value)
	const exactNotes = props.state.currentRelease || props.state.whatsNew
	if (exactNotes?.version === window.TALK_DESKTOP.packageInfo.version) {
		installedNotes.value = exactNotes
	}
	if (props.state.whatsNew && installedNotes.value && isMainWindow.value && !inCall.value && !visible.value) {
		notesVisible.value = true
	}
	if (!isMainWindow.value || inCall.value || visible.value) {
		notesVisible.value = false
	}
	if (props.state.status === 'error') {
		restarting.value = false
	}
}, { immediate: true })

/** Begin the durable grace clock only when the user can see this notice. */
async function reportVisible() {
	if (visible.value && props.state.mandatory && isMainWindow.value && document.visibilityState === 'visible') {
		try {
			await window.TALK_DESKTOP.desktopUpdateNoticeShown()
		} catch {
			feedback.value = t('talk_desktop', 'Could not confirm the update notice. Please try again.')
		}
	}
}
watch([visible, () => props.state.mandatory], reportVisible, { flush: 'post', immediate: true })
document.addEventListener('visibilitychange', reportVisible)
onBeforeUnmount(() => document.removeEventListener('visibilitychange', reportVisible))

/** Reopen an update without consenting to download or install. */
function open() {
	feedback.value = ''
	visible.value = isMainWindow.value && notice.reconcile(props.state, inCall.value, true)
	if (visible.value) {
		notesVisible.value = false
		void reportVisible()
	}
	return visible.value
}

/** Show the installed release again without changing its acknowledgement. */
function openNotes() {
	if (!isMainWindow.value || inCall.value || props.state.mandatory || !installedNotes.value) {
		return false
	}
	visible.value = false
	notesVisible.value = true
	return true
}

/** Mandatory policy is authoritative in main; the renderer also prevents dismissal. */
function dismiss() {
	if (props.state.mandatory || restarting.value) {
		return
	}
	notice.dismiss()
	visible.value = false
}

/** Only this explicit action persists a release acknowledgement. */
async function dismissNotes() {
	if (acknowledging.value || !installedNotes.value) {
		return
	}
	acknowledging.value = true
	feedback.value = ''
	try {
		const accepted = await window.TALK_DESKTOP.acknowledgeDesktopRelease(installedNotes.value.version)
		if (accepted !== true) {
			feedback.value = t('talk_desktop', 'Could not save your acknowledgement. Please try again.')
			return
		}
		notesVisible.value = false
	} catch {
		feedback.value = t('talk_desktop', 'Could not save your acknowledgement. Please try again.')
	} finally {
		acknowledging.value = false
	}
}

/** Ask main to download the offered version after explicit consent. */
async function download() {
	if (downloading.value || ['downloading', 'ready'].includes(props.state.status)) {
		return
	}
	downloading.value = true
	feedback.value = ''
	try {
		await window.TALK_DESKTOP.downloadDesktopUpdate()
	} catch {
		feedback.value = t('talk_desktop', 'The download could not start. Please try again.')
	} finally {
		downloading.value = false
	}
}

/** Main independently validates required policy and active calls before restarting. */
async function restart() {
	if (props.state.manualInstall || restarting.value || (inCall.value && !props.state.mandatory) || props.state.status !== 'ready') {
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

/** Main owns the verified file path; the renderer cannot open arbitrary files. */
async function revealInstaller() {
	feedback.value = ''
	try {
		if (!await window.TALK_DESKTOP.revealDesktopUpdate()) {
			feedback.value = t('talk_desktop', 'Could not locate the installer. Please download it again.')
		}
	} catch {
		feedback.value = t('talk_desktop', 'Could not show the installer in Finder. Please try again.')
	}
}

/** Quit this application, including its active call windows. */
async function quit() {
	try {
		await window.TALK_DESKTOP.quitForDesktopUpdate()
	} catch {
		feedback.value = t('talk_desktop', 'Could not close the app. Please try again.')
	}
}

defineExpose({ open, openNotes })
</script>

<template>
	<NcDialog
		v-if="visible && isMainWindow"
		:name="title"
		:noClose="state.mandatory || restarting"
		:closeOnClickOutside="false"
		size="normal"
		@update:open="dismiss">
		<div class="update-notice">
			<span class="release-version">{{ t('talk_desktop', 'Version {version}', { version: state.release?.version || state.version || '' }) }}</span>
			<h3 v-if="state.release?.title">
				{{ state.release.title }}
			</h3>
			<ul v-if="state.release?.summary?.length" class="release-summary">
				<li v-for="(item, index) in state.release.summary" :key="index">
					{{ item }}
				</li>
			</ul>
			<div v-if="state.mandatory" class="required-warning" role="alert">
				<strong>{{ t('talk_desktop', 'This update is required to continue using the app.') }}</strong>
				<p v-if="state.persistenceFailed && state.message">
					{{ state.message }}
				</p>
				<p v-else-if="state.expired">
					{{ t('talk_desktop', 'The update deadline has passed. Update now to continue, or quit the app.') }}
				</p>
				<p v-else-if="state.deadline">
					{{ t('talk_desktop', 'The app will close in {time} if it has not been updated.', { time: countdown }) }}
				</p>
				<p v-else>
					{{ t('talk_desktop', 'Please update now or quit. The update deadline will appear here.') }}
				</p>
				<p>{{ t('talk_desktop', 'Closing or restarting the app ends any active call and screen sharing. Closing this window does not postpone the deadline.') }}</p>
			</div>
			<template v-if="state.status === 'ready' && state.manualInstall">
				<p>{{ t('talk_desktop', 'The download has been verified. This Mac app is not signed by an identified Apple developer and must be installed manually.') }}</p>
				<ol>
					<li>{{ t('talk_desktop', 'Choose Show in Finder to locate the downloaded disk image.') }}</li>
					<li>{{ t('talk_desktop', 'Finish any calls, then fully quit this app.') }}</li>
					<li>{{ t('talk_desktop', 'Open the disk image, drag the new app into Applications, and choose Replace when asked.') }}</li>
					<li>{{ t('talk_desktop', 'Open the app from Applications, then eject the disk image. Your existing account and settings stay in place.') }}</li>
				</ol>
				<p>{{ t('talk_desktop', 'If macOS blocks an unidentified developer, only proceed if you trust this release. Open System Settings → Privacy & Security and review the Open Anyway option after the blocked launch. If your organisation prevents this, contact your administrator.') }}</p>
				<p>{{ t('talk_desktop', 'The app will not close or replace itself automatically. You can return to these instructions from the update menu.') }}</p>
			</template>
			<template v-else-if="state.status === 'ready'">
				<p>{{ t('talk_desktop', 'Your update is downloaded. Restart to install it and reopen the app. Your account and settings will be kept.') }}</p>
				<p v-if="inCall && !state.mandatory">
					{{ t('talk_desktop', 'Finish your call before restarting.') }}
				</p>
			</template>
			<template v-else-if="state.status === 'downloading' || downloading">
				<p role="status">
					{{ t('talk_desktop', 'Downloading your update…') }}
				</p>
				<progress :aria-label="t('talk_desktop', 'Downloading update')" />
			</template>
			<p v-else-if="state.status === 'error'" role="alert">
				{{ t('talk_desktop', 'The update could not be completed. Please try again.') }}
			</p>
			<p v-else-if="state.status === 'checking'">
				{{ t('talk_desktop', 'Checking for updates…') }}
			</p>
			<p v-else-if="state.manualInstall" class="update-hint">
				{{ t('talk_desktop', 'Choose Download update to save and verify the Mac installer. This unsigned app requires manual installation; instructions will appear when the download finishes.') }}
			</p>
			<p v-else class="update-hint">
				{{ t('talk_desktop', 'Choose Update now to download. We will ask you before restarting. Windows may then ask for permission to install.') }}
			</p>
			<p v-if="restarting" role="status">
				{{ t('talk_desktop', 'Restarting to install the update…') }}
			</p>
			<p v-if="feedback" role="alert">
				{{ feedback }}
			</p>
		</div>
		<template #actions>
			<NcDialogButton
				v-if="state.mandatory"
				:label="t('talk_desktop', 'Quit app')"
				:disabled="restarting"
				@click="quit" />
			<NcDialogButton
				v-else
				:label="t('talk_desktop', 'Skip for now')"
				:disabled="restarting"
				@click="dismiss" />
			<NcDialogButton
				v-if="state.status === 'ready' && state.manualInstall"
				variant="primary"
				:label="t('talk_desktop', 'Show in Finder')"
				@click="revealInstaller" />
			<NcDialogButton
				v-else-if="state.status === 'ready'"
				variant="primary"
				:label="t('talk_desktop', 'Restart to update')"
				:disabled="restarting || (inCall && !state.mandatory)"
				@click="restart" />
			<NcDialogButton
				v-else-if="state.release && state.status !== 'downloading'"
				variant="primary"
				:label="state.manualInstall ? t('talk_desktop', 'Download update') : t('talk_desktop', 'Update now')"
				:disabled="downloading || state.status === 'checking'"
				@click="download" />
			<NcDialogButton v-else-if="state.status === 'error'" :label="t('talk_desktop', 'Retry update check')" @click="emit('retry')" />
		</template>
	</NcDialog>
	<NcDialog
		v-if="notesVisible && installedNotes && isMainWindow"
		:name="t('talk_desktop', 'What’s new')"
		noClose
		:closeOnClickOutside="false"
		size="large">
		<article class="update-notice release-notes">
			<span class="release-version">{{ t('talk_desktop', 'Installed version {version}', { version: installedNotes.version }) }}</span>
			<h2>{{ installedNotes.title }}</h2>
			<ul class="release-summary">
				<li v-for="(item, index) in installedNotes.summary" :key="index">
					{{ item }}
				</li>
			</ul>
			<section v-for="(section, index) in installedNotes.sections" :key="index">
				<h3>{{ section.heading }}</h3>
				<p class="release-body">
					{{ section.body }}
				</p>
				<figure v-for="image in section.images" :key="image.url">
					<img
						v-if="!failedImages.has(image.url)"
						:src="image.url"
						:alt="image.alt"
						referrerpolicy="no-referrer"
						loading="lazy"
						@error="failedImages.add(image.url)">
					<p v-else>
						{{ t('talk_desktop', 'Screenshot unavailable: {description}', { description: image.alt }) }}
					</p>
					<figcaption v-if="image.caption">
						{{ image.caption }}
					</figcaption>
				</figure>
			</section>
			<p v-if="feedback" role="alert">
				{{ feedback }}
			</p>
		</article>
		<template #actions>
			<NcDialogButton
				variant="primary"
				:label="t('talk_desktop', 'Got it')"
				:disabled="acknowledging"
				@click="dismissNotes" />
		</template>
	</NcDialog>
</template>

<style scoped>
.update-notice { display: grid; gap: 16px; padding: 16px; line-height: 1.6; }
.release-version { color: var(--color-text-maxcontrast); font-size: 14px; }
h2, h3 { margin: 0; font-weight: 600; }
h3 { font-size: 20px; }
.release-summary { padding-inline-start: 24px; list-style: disc; }
.release-summary li { margin-block: 6px; }
.required-warning { padding: 16px; border-inline-start: 4px solid var(--color-warning); background: var(--color-background-dark); border-radius: 8px; }
.update-hint { color: var(--color-text-maxcontrast); }
progress { width: 100%; }
.release-body { white-space: pre-wrap; overflow-wrap: anywhere; }
.release-notes section { padding-block: 12px; border-top: 1px solid var(--color-border); }
figure { margin: 16px 0; }
img { display: block; max-width: 100%; height: auto; border-radius: 8px; }
figcaption { margin-top: 8px; color: var(--color-text-maxcontrast); font-size: 14px; }
</style>
