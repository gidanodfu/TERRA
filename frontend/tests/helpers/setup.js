import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { MockEventSource } from './event-source'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.cookie = 'terra_csrf=; Max-Age=0; path=/'
  MockEventSource.instances = []
})

globalThis.EventSource = MockEventSource

if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}

if (!window.scrollTo) {
  window.scrollTo = () => {}
}
