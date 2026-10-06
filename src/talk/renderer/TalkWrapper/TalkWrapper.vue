<!--
  - SPDX-FileCopyrightText: 2025 Nextcloud GmbH and Nextcloud contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
  -->

<script setup lang="ts">
import { onMounted } from 'vue'
import { appData } from '../../../app/AppData.js'
import { subscribeBroadcast } from '../../../shared/broadcast.service.ts'
import { installCallWindowLifecycle } from '../CallWindow/callWindowLifecycle.js'
import { callWindowState } from '../CallWindow/callWindowState.ts'
import { registerEdisonActionCards } from '../EdisonActions/register.js'
import { registerTalkDesktopSettingsSection } from '../Settings/index.ts'
import { onTalkHashDirty, onTalkHashUpdate, openConversation, setTalkHash } from './talk.service.ts'
import { useBadgeCountIntegration } from './useBadgeCountIntegration.ts'

const emit = defineEmits<{
	ready: []
}>()

onMounted(async () => {
	const actionCards = registerEdisonActionCards()
	// Importing the main Talk entry point mounts a Vue app to the #content
	await import('@talk/src/main.js')
	window.OCA.Talk.instance.$router.afterEach(() => actionCards.invalidateContexts())

	// Additional integrations
	registerTalkDesktopSettingsSection()
	subscribeBroadcast('talk:conversation:open', ({ token, directCall }) => {
		if (!callWindowState.isCallWindow) {
			openConversation(token, { directCall })
		}
	})
	installCallWindowLifecycle()
	useBadgeCountIntegration()

	// If there is a talkHash - set it initially
	if (appData.talkHash) {
		setTalkHash(appData.talkHash)
	}
	// Handle Talk Hash updates
	onTalkHashUpdate((hash: string) => {
		appData.setTalkHash(hash).persist()
	})
	onTalkHashDirty(() => {
		appData.setTalkHashDirty(true).persist()
	})

	// Ready
	emit('ready')
})
</script>

<template>
	<div id="content" />
</template>

<style>
/* Retain the original call renderer and its media, but remove chat navigation.
   Conversation participants and the current call's chat stay available. */
.desktop-call-window #app-navigation,
.desktop-call-window .app-navigation,
.desktop-call-window .app-navigation-toggle {
	display: none !important;
}

.desktop-call-window #app-content {
	margin-inline-start: 0 !important;
	width: 100% !important;
}
</style>
