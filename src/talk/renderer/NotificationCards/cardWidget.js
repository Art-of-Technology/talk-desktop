/* SPDX-License-Identifier: AGPL-3.0-or-later */
/**
 *
 * @param {string} serverUrl Configured account server.
 * @param {string} cardId Opaque card identifier.
 */
export function cardUrl(serverUrl, cardId) {
	if (!/^[a-f0-9]{32}$/.test(cardId)) {
		throw new Error('Invalid card id')
	}
	const base = new URL(serverUrl)
	if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
		throw new Error('Invalid server URL')
	}
	base.pathname = base.pathname.replace(/\/$/, '').replace(/\/index\.php$/, '') + '/index.php/apps/workspace_integrations/api/cards/' + cardId
	return base.href
}
/**
 * Use the existing main-process, account-scoped authentication interceptor.
 *
 * @param {object} root0 Injectable widget or transport services.
 * @param {typeof fetch} root0.fetchImpl Fetch implementation.
 * @param {number} root0.timeoutMs Request timeout.
 */
export function createCardTransport({ fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
	return async ({ context, cardId, signal }) => {
		const controller = new AbortController()
		const abort = () => controller.abort()
		if (signal?.aborted) {
			return { status: 'gone' }
		}
		signal?.addEventListener('abort', abort, { once: true })
		let timer = null
		try {
			const url = cardUrl(context.serverUrl, cardId)
			const deadline = new Promise((resolve) => {
				timer = setTimeout(() => {
					controller.abort()
					resolve({ status: 'error' })
				}, timeoutMs)
			})
			const request = (async () => {
				const response = await fetchImpl(url, { method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal })
				if (response.status === 404) {
					return { status: 'gone' }
				}
				if (!response.ok) {
					return { status: 'error' }
				}
				const body = await response.json()
				return { status: 'ok', body }
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
/**
 *
 * @param {object} root0 Injectable widget or transport services.
 * @param {() => {serverUrl: string, accountId: string, token: string}} root0.getContext Current account and conversation.
 * @param {(input: {context: object, cardId: string, signal: AbortSignal}) => Promise<{status: string, body?: object}>} root0.request Authenticated read transport.
 * @param {(card: object, options: {document: Document}) => HTMLElement} root0.render Shared DOM renderer.
 * @param {Document} root0.document Renderer document.
 * @param {number[]} root0.retryDelays Initial missing-card retry delays.
 * @param {number} root0.refreshMs Membership revalidation interval.
 */
export function createCardWidget({ getContext, request, render, document = globalThis.document, retryDelays = [1000, 3000], refreshMs = 30000 }) {
	const mounted = new Set()
	const same = (a, b) => a?.serverUrl === b?.serverUrl && a?.accountId === b?.accountId && a?.token === b?.token
	/**
	 *
	 * @param {object} ctx Mounted widget context.
	 */
	function stop(ctx) {
		ctx.dead = true
		clearTimeout(ctx.refreshTimer)
		ctx.abort.abort()
		mounted.delete(ctx)
		ctx.root.replaceChildren()
	}
	/**
	 *
	 * @param {object} ctx Mounted widget context.
	 * @param {string} cardId Opaque card identifier.
	 */
	async function read(ctx, cardId) {
		let result = await request({ context: ctx.context, cardId, signal: ctx.abort.signal })
		for (const delay of (ctx.rendered ? [] : retryDelays)) {
			if (result.status !== 'gone' || ctx.dead || !same(ctx.context, getContext())) {
				break
			}
			ctx.root.replaceChildren()
			await new Promise((resolve) => {
				let timer = null
				const done = () => {
					clearTimeout(timer)
					ctx.abort.signal.removeEventListener('abort', done)
					resolve()
				}
				timer = setTimeout(done, delay)
				ctx.abort.signal.addEventListener('abort', done, { once: true })
			})
			if (ctx.dead || !same(ctx.context, getContext())) {
				break
			}
			result = await request({ context: ctx.context, cardId, signal: ctx.abort.signal })
		}
		return result
	}
	/**
	 * Read immutable contents and revalidate membership without reloading images.
	 *
	 * @param {object} ctx Mounted widget context.
	 * @param {string} cardId Opaque card identifier.
	 */
	async function refresh(ctx, cardId) {
		try {
			const result = await read(ctx, cardId)
			if (ctx.dead || !same(ctx.context, getContext())) {
				stop(ctx)
				return
			}
			if (result.status === 'gone') {
				stop(ctx)
				return
			}
			if (result.status !== 'ok') {
				throw new Error('Card unavailable')
			}
			if (!ctx.rendered) {
				ctx.root.replaceChildren(render(result.body, { document }))
				ctx.rendered = true
			}
		} catch {
			if (ctx.dead || !same(ctx.context, getContext())) {
				stop(ctx)
				return
			}
			// A failed access recheck must not leave previously private contents visible.
			ctx.root.replaceChildren()
			ctx.root.textContent = 'Notification unavailable. Reopen this conversation to try again.'
			ctx.rendered = false
		}
		if (!ctx.dead) {
			ctx.refreshTimer = setTimeout(() => {
				void refresh(ctx, cardId)
			}, refreshMs)
		}
	}
	return {
		callback(host, args) {
			for (const previous of mounted) {
				if (previous.host === host) {
					stop(previous)
					previous.root.remove?.()
				}
			}
			const context = { ...getContext() }, cardId = args?.richObject?.cardId
			const root = document.createElement('div')
			host.appendChild(root)
			const ctx = { host, root, context, dead: false, rendered: false, refreshTimer: null, abort: new AbortController() }
			mounted.add(ctx)
			if (!context.accountId || !context.serverUrl || !/^[a-f0-9]{32}$/.test(cardId)) {
				stop(ctx)
				return
			}
			root.textContent = 'Loading notification…'
			void refresh(ctx, cardId)
		},
		onDestroy(host) {
			for (const ctx of mounted) {
				if (ctx.host === host || host.contains(ctx.root)) {
					stop(ctx)
					mounted.delete(ctx)
				}
			}
		},
		invalidateContexts() {
			for (const ctx of mounted) {
				if (!same(ctx.context, getContext())) {
					stop(ctx)
					mounted.delete(ctx)
				}
			}
		},
	}
}
