/**
 * Open the context selector for the current Smart Context.
 *
 * @this {import('smart-contexts').SmartContext}
 * @param {object} [params={}]
 * @returns {boolean}
 */
export function context_open_builder(params = {}) {
  if (typeof this?.emit_event !== 'function') return false;

  const {
    menu_ctx: _menu_ctx,
    click_event: _click_event,
    click_args: _click_args,
    ...selector_params
  } = params;

  this.emit_event('context_selector:open', {
    ...selector_params,
    event_source: selector_params.event_source || 'context_open_builder',
  });
  return true;
}

export const menus = {
  'smart_context:action_menu': {
    title: 'Open in context builder',
    icon: 'smart-context-builder',
    order: 0,
  },
};
