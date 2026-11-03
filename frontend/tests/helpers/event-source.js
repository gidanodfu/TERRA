export class MockEventSource {
  static instances = []

  constructor(url) {
    this.url = url
    this.closed = false
    this.listeners = {}
    MockEventSource.instances.push(this)
  }

  addEventListener(type, handler) {
    if (!this.listeners[type]) this.listeners[type] = []
    this.listeners[type].push(handler)
  }

  removeEventListener(type, handler) {
    this.listeners[type] = (this.listeners[type] || []).filter((item) => item !== handler)
  }

  emit(type, payload) {
    const event = { data: JSON.stringify(payload) }
    for (const handler of this.listeners[type] || []) handler(event)
  }

  close() {
    this.closed = true
  }
}
