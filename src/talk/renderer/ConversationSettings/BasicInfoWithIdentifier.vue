<!--
  - SPDX-FileCopyrightText: 2026 Desktop client contributors
  - SPDX-License-Identifier: AGPL-3.0-or-later
-->

<script setup>
import { t } from '@nextcloud/l10n'
import { computed, ref, watch } from 'vue'
import NcButton from '@nextcloud/vue/components/NcButton'
import BasicInfo from '@talk/src/components/ConversationSettings/BasicInfo.vue'
import IconCheck from 'vue-material-design-icons/Check.vue'
import IconCopy from 'vue-material-design-icons/ContentCopy.vue'

const props = defineProps({
	conversation: { type: Object, required: true },
	canFullModerate: { type: Boolean, required: true },
})

const token = computed(() => props.conversation.token || '')
const copyState = ref('idle')
watch(token, () => {
	copyState.value = 'idle'
})

/** Copy the conversation token, not a URL or the internal numeric room ID. */
async function copyToken() {
	const value = token.value
	if (!value) {
		return
	}
	try {
		await navigator.clipboard.writeText(value)
		if (token.value === value) {
			copyState.value = 'copied'
		}
	} catch {
		if (token.value === value) {
			copyState.value = 'error'
		}
	}
}
</script>

<template>
	<BasicInfo :conversation="conversation" :canFullModerate="canFullModerate" />
	<template v-if="token">
		<h4 class="app-settings-section__subtitle">
			{{ t('talk_desktop', 'Conversation ID') }}
		</h4>
		<div class="conversation-identifier">
			<input
				:aria-label="t('talk_desktop', 'Conversation ID')"
				:value="token"
				class="conversation-identifier__value"
				readonly
				spellcheck="false">
			<NcButton :aria-label="t('talk_desktop', 'Copy conversation ID')" @click="copyToken">
				<template #icon>
					<IconCheck v-if="copyState === 'copied'" :size="20" />
					<IconCopy v-else :size="20" />
				</template>
				{{ copyState === 'copied' ? t('talk_desktop', 'Copied') : t('talk_desktop', 'Copy') }}
			</NcButton>
		</div>
		<p class="app-settings-section__hint" role="status" aria-live="polite">
			{{ copyState === 'error'
				? t('talk_desktop', 'Could not copy. Select the conversation ID and copy it manually.')
				: copyState === 'copied' ? t('talk_desktop', 'Conversation ID copied') : '' }}
		</p>
	</template>
</template>

<style scoped>
.conversation-identifier {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.conversation-identifier__value {
	font-family: monospace;
	width: 240px;
	max-width: 100%;
	min-width: 0;
}
</style>
