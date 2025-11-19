export function send_context_updated_event(container) {
  container.dispatchEvent(new CustomEvent('smart-env:context-updated', {
    detail: { updated: true },
    bubbles: true,
    composed: true
  }));
}