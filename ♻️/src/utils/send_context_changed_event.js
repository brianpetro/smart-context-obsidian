export function send_context_changed_event(container, next_ctx) {
  container.dispatchEvent(new CustomEvent('smart-env:context-changed', {
    detail: { context: next_ctx },
    bubbles: true,
    composed: true
  }));
}
