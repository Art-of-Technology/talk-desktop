/* SPDX-License-Identifier: AGPL-3.0-or-later */

const ACTIONS = new Set(['approve', 'decline', 'retry', 'manual'])
const STATES = new Set(['pending', 'resolved', 'expired', 'superseded', 'disabled'])
const RESULTS = new Set(['accepted', 'already_handled', 'not_authorized', 'expired', 'disabled', 'invalid'])
const ERROR = "Edison'a ulaşılamadı, lütfen tekrar deneyin."
const string = (value) => typeof value === 'string' && value.length <= 10000

/**
 *
 * @param {object} value Live server payload to validate.
 */
export function validState(value) {
	return value && STATES.has(value.state) && string(value.title)
		&& Array.isArray(value.lines) && value.lines.length <= 100 && value.lines.every(string)
		&& Array.isArray(value.actions) && value.actions.length <= 4
		&& new Set(value.actions.map((a) => a?.id)).size === value.actions.length
		&& value.actions.every((a) => a && ACTIONS.has(a.id) && string(a.label) && typeof a.allowed === 'boolean')
		&& (!value.resolution || (string(value.resolution.byDisplay) && ACTIONS.has(value.resolution.action)))
}

/**
 *
 * @param {object} root0 Injected browser and transport services.
 * @param {function(): object} root0.getContext Injectable getContext service.
 * @param {function(object): Promise<object>} root0.post Injectable post service.
 * @param {function(object): Promise<boolean>} root0.confirm Injectable confirm service.
 * @param {object} root0.document Injectable document service.
 * @param {object} root0.crypto Injectable crypto service.
 * @param {function(function(): void, number): number} root0.setInterval Injectable setInterval service.
 * @param {function(number): void} root0.clearInterval Injectable clearInterval service.
 */
export function createActionWidget({ getContext, post, confirm, document = globalThis.document, crypto = globalThis.crypto, setInterval = globalThis.setInterval, clearInterval = globalThis.clearInterval }) {
	const mounted = new Set()

	const same = (a, b) => a && b && a.serverUrl === b.serverUrl && a.accountId === b.accountId && a.token === b.token

	const element = (tag, className, text) => {
		const node = document.createElement(tag)

		node.className = className

		if (text !== undefined) {
			node.textContent = text
		}

		return node
	}

	const hide = (ctx) => {
		ctx.root.textContent = ''
		const frame = ctx.host.closest('.widget-custom') || ctx.host
		frame.style.display = 'none'
	}

	const stop = (ctx) => {
		ctx.dead = true

		clearInterval(ctx.timer)

		ctx.abort.abort()

		hide(ctx)
	}

	const active = (ctx) => {
		if (!ctx.dead && !same(ctx.context, getContext())) {
			stop(ctx)
		}

		return !ctx.dead
	}

	const handlers = {}

	const render = (ctx) => {
		ctx.root.textContent = ''

		if (ctx.dead || (!ctx.state && !ctx.error && !ctx.clickError)) {
			return hide(ctx)
		}
		(ctx.host.closest('.widget-custom') || ctx.host).style.display = ''

		const card = element('div', 'edison-card')

		card.style.cssText = 'border:1px solid var(--color-border);border-radius:10px;padding:12px;background:var(--color-main-background);color:var(--color-main-text)'

		if (ctx.state) {
			card.appendChild(element('strong', 'edison-title', ctx.state.title))

			for (const line of ctx.state.lines) {
				card.appendChild(element('div', 'edison-line', line))
			}

			if (ctx.state.state === 'pending') {
				const row = element('div', 'edison-actions')

				row.style.cssText = 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap'

				for (const action of ctx.state.actions) {
					const button = element('button', 'edison-btn' + (action.style === 'primary' ? ' primary' : ''), action.label)

					button.type = 'button'

					button.disabled = !action.allowed || ctx.busy || ctx.error || ctx.loading

					button.addEventListener('click', () => {
						void handlers.click(ctx, action.id)
					})

					row.appendChild(button)
				}

				card.appendChild(row)
			} else {
				const labels = { resolved: 'Sonuçlandı', expired: 'Süresi doldu', superseded: 'Yerine daha yeni bir istek gönderildi', disabled: 'Şu anda kullanılamıyor' }

				const resolution = ctx.state.resolution

				const text = labels[ctx.state.state] + (resolution ? ' — ' + resolution.byDisplay : '')

				card.appendChild(element('div', 'edison-resolution', text))
			}
		}

		if (ctx.error || ctx.clickError) {
			const error = element('div', 'edison-error', ERROR)

			error.setAttribute('role', 'alert')

			card.appendChild(error)
		}

		if (ctx.feedback) {
			const feedback = element('div', 'edison-feedback', ctx.feedback)

			feedback.setAttribute('role', 'status')

			card.appendChild(feedback)
		}

		ctx.root.appendChild(card)
	}

	const request = async (ctx, endpoint, body) => {
		try {
			return await post({ context: { ...ctx.context }, promptId: ctx.promptId, endpoint, body, signal: ctx.abort.signal })
		} catch {
			return { status: 'error' }
		}
	}

	const load = async (ctx) => {
		if (!active(ctx) || ctx.busy || ctx.loading) {
			return
		}

		ctx.loading = true

		render(ctx)

		const response = await request(ctx, 'state', { conversationToken: ctx.context.token })

		ctx.loading = false

		if (!active(ctx)) {
			return
		}

		if (response?.status === 'gone') {
			return stop(ctx)
		}

		ctx.error = !(response?.status === 'ok' && validState(response.body))

		if (!ctx.error) {
			ctx.state = response.body
		}

		render(ctx)
	}

	handlers.click = async (ctx, actionId) => {
		if (!active(ctx) || ctx.busy || ctx.loading || ctx.error || ctx.state?.state !== 'pending') {
			return
		}

		const action = ctx.state.actions.find((a) => a.id === actionId && a.allowed === true)

		if (!action || !ACTIONS.has(actionId)) {
			return
		}

		ctx.busy = true

		render(ctx)

		try {
			if (actionId !== 'decline' && await confirm({ actionId, label: action.label }) !== true) {
				return
			}

			if (!active(ctx)) {
				return
			}

			const bytes = new Uint8Array(16)

			crypto.getRandomValues(bytes)

			const clickId = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

			ctx.feedback = ''

			ctx.clickError = false

			const response = await request(ctx, 'actions', { conversationToken: ctx.context.token, clickId, actionId })

			if (!active(ctx)) {
				return
			}

			if (response?.status === 'gone') {
				return stop(ctx)
			}

			ctx.clickError = !(response?.status === 'ok' && RESULTS.has(response.body?.result) && string(response.body.message))

			if (!ctx.clickError) {
				ctx.feedback = response.body.message
			}
		} catch {
			ctx.clickError = true
		} finally {
			ctx.busy = false

			if (active(ctx)) {
				// Re-read even after a failed/uncertain action. Never repeat the action POST.

				await load(ctx)
			}
		}
	}

	return {
		callback(host, args) {
			const promptId = args?.richObject?.promptId

			const context = getContext()

			const root = element('div', 'edison-actions-widget')

			host.appendChild(root)

			const ctx = { host, root, promptId, context: { ...context }, abort: new AbortController(), state: null, dead: false, busy: false, loading: false, error: false, clickError: false, feedback: '', timer: null }

			mounted.add(ctx)

			if (typeof promptId !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(promptId) || !/^[a-z0-9]{4,30}$/.test(context?.token || '') || !context?.accountId || !context?.serverUrl) {
				return stop(ctx)
			}

			ctx.timer = setInterval(() => {
				void load(ctx)
			}, 15000)

			void load(ctx)
		},
		onDestroy(host) {
			for (const ctx of mounted) {
				if (host === ctx.host || host.contains(ctx.root)) {
					stop(ctx)

					mounted.delete(ctx)
				}
			}
		},
		invalidateContexts() {
			for (const ctx of mounted) {
				active(ctx)
			}
		},
	}
}
