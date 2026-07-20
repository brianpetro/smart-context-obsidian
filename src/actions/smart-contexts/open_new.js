/**
 * Create a new Smart Context and open its selector.
 *
 * @this {import('smart-contexts').SmartContexts}
 * @param {object} [params={}]
 * @param {string[]} [params.add_items]
 * @returns {import('smart-contexts').SmartContext}
 */
export function smart_contexts_open_new(params = {}) {
  const add_items = Array.isArray(params.add_items)
    ? params.add_items
    : []
  ;
  const ctx = this.new_context({}, { add_items });
  const {
    add_items: _add_items,
    ...selector_params
  } = params;

  ctx.emit_event('context_selector:open', selector_params);
  return ctx;
}

export const commands = {
  'new-context-open-selector': {
    name: 'Open Selector for New Context',

    register_when({ plugin }) {
      return plugin.manifest.id === 'smart-context';
    },

    get_scope({ env }) {
      return env.smart_contexts;
    },
  },
};

export const ribbon_icons = {
  new_context: {
    icon_name: 'smart-context-builder',
    description: 'Smart Context: Open Builder',

    register_when({ plugin }) {
      return plugin.manifest.id === 'smart-context';
    },

    get_scope({ env }) {
      return env.smart_contexts;
    },
  },
};
