import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../../app/ThemeContext'

let loader = null

function loadTurnstile() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loader) return loader
  loader = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-terra-turnstile]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.turnstile))
      existing.addEventListener('error', reject)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.dataset.terraTurnstile = 'true'
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile unavailable')))
    script.onerror = () => reject(new Error('Turnstile unavailable'))
    document.head.appendChild(script)
  })
  return loader
}

export function Turnstile({ onToken, onExpire, action = 'admin_login' }) {
  const { theme } = useTheme()
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY
  const container = useRef(null)
  const tokenCallback = useRef(onToken)
  const expireCallback = useRef(onExpire)
  const widgetId = useRef(null)
  const [failure, setFailure] = useState(false)

  useEffect(() => {
    tokenCallback.current = onToken
    expireCallback.current = onExpire
  }, [onToken, onExpire])

  useEffect(() => {
    if (!siteKey || !container.current) return undefined
    let cancelled = false
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.current) return
        widgetId.current = turnstile.render(container.current, {
          sitekey: siteKey,
          action,
          theme: theme === 'dark' ? 'dark' : 'light',
          callback: (token) => tokenCallback.current?.(token),
          'expired-callback': () => {
            tokenCallback.current?.('')
            expireCallback.current?.()
          },
          'error-callback': () => {
            tokenCallback.current?.('')
            setFailure(true)
          },
        })
      })
      .catch(() => setFailure(true))
    return () => {
      cancelled = true
      try {
        if (window.turnstile && widgetId.current !== null) window.turnstile.remove(widgetId.current)
      } catch {
        // widget already removed
      }
      widgetId.current = null
    }
  }, [siteKey, action, theme])

  if (!siteKey) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Falta configurar <code>VITE_TURNSTILE_SITE_KEY</code> en la compilación del frontend.
      </p>
    )
  }
  return (
    <div className="flex min-h-[65px] flex-col items-center justify-center">
      <div ref={container} />
      {failure ? (
        <p className="mt-1 text-center text-sm text-red-600">
          No fue posible cargar la verificación de seguridad. Recargue la página.
        </p>
      ) : null}
    </div>
  )
}
