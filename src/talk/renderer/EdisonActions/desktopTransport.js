/**
 * SPDX-FileCopyrightText: 2026 Desktop client contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Resolve only the dedicated desktop relay under the authenticated account.
 *
 * @param {string} serverUrl - Authenticated account server
 * @param {string} promptId - Validated prompt identifier
 * @param {string} endpoint - State or action route
 */
export function relayUrl(serverUrl, promptId, endpoint) {
	if (!/^[A-Za-z0-9_-]{16,64}$/.test(promptId) || !['state', 'actions'].includes(endpoint)) {
		throw new Error('Invalid relay request')
	}
	const base = new URL(serverUrl)
	if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash) {
		throw new Error('Invalid account server')
	}
	base.pathname = base.pathname.replace(/\/$/, '').replace(/\/index\.php$/, '')
		+ '/index.php/apps/edison_actions/api/desktop/prompts/' + promptId + '/' + endpoint
	return base.href
}

/**
 * Use the existing main-process account authentication; never accept credentials here.
 *
 * @param {object} root0 - Transport options
 * @param {typeof fetch} root0.fetchImpl - Browser fetch implementation
 * @param {number} root0.timeoutMs - Request deadline in milliseconds
 */
export function createDesktopTransport({ fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
	return async ({ context, promptId, endpoint, body, signal }) => {
		const controller = new AbortController()
		let timer
		const abort = () => controller.abort()
		if (signal?.aborted) {
			return { status: 'error' }
		}
		signal?.addEventListener('abort', abort, { once: true })
		try {
			const url = relayUrl(context.serverUrl, promptId, endpoint)
			// Whitelist the contract fields: identity and unknown caller fields never leave.
			if (!/^[a-z0-9]{4,30}$/.test(body.conversationToken)) {
				return { status: 'error' }
			}
			const payload = { conversationToken: body.conversationToken }
			if (endpoint === 'actions') {
				if (!/^[A-Za-z0-9_-]{22,64}$/.test(body.clickId)
					|| !['approve', 'decline', 'retry', 'manual'].includes(body.actionId)) {
					return { status: 'error' }
				}
				Object.assign(payload, { clickId: body.clickId, actionId: body.actionId })
			}
			const deadline = new Promise((resolve) => {
				timer = setTimeout(() => {
					controller.abort()
					resolve({ status: 'error' })
				}, timeoutMs)
			})
			const request = (async () => {
				const response = await fetchImpl(url, {
					method: 'POST',
					credentials: 'omit',
					cache: 'no-store',
					redirect: 'error',
					headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
					body: JSON.stringify(payload),
					signal: controller.signal,
				})
				if (response.status === 404) {
					return { status: 'gone' }
				}
				if (!response.ok) {
					return { status: 'error' }
				}
				const data = await response.json()
				return data && typeof data === 'object' && !Array.isArray(data)
					? { status: 'ok', body: data }
					: { status: 'error' }
			})().catch(() => ({ status: 'error' }))
			return await Promise.race([request, deadline])
		} catch {
			return { status: 'error' }
		} finally {
			clearTimeout(timer)
			signal?.removeEventListener('abort', abort)
		}
	}
}
