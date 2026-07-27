/**
 * Open the canonical Builder for the current Smart Context.
 *
 * @this {import('smart-contexts').SmartContext}
 * @param {object} [params={}]
 * @returns {boolean}
 */
export function context_open_builder(params = {}) {
  if (typeof this?.collection?.open_builder !== 'function') return false;

  const {
    menu_ctx: _menu_ctx,
    click_event: _click_event,
    click_args: _click_args,
    ...builder_params
  } = params;
  builder_params.event_source = builder_params.event_source
    || 'context_open_builder'
  ;

  return this.collection.open_builder(this, builder_params);
}

export const menus = {
  'smart_context:action_menu': {
    title: 'Open in context builder',
    icon: 'smart-context-builder',
    order: 0,
    when() {
      return this.params?.surface !== 'context_builder';
    },
  },
};
