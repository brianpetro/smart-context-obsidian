/**
 * Open the Smart Context named-contexts dashboard.
 *
 * @this {import('smart-contexts').SmartContexts} Collection scope
 * @param {object} [params={}]
 * @param {object} [params.plugin]
 * @returns {boolean}
 */
export function smart_contexts_open_dashboard(params = {}) {
  const plugin = params.plugin || this?.env?.smart_context_plugin;
  if (typeof plugin?.open_contexts_dashboard !== 'function') return false;

  plugin.open_contexts_dashboard();
  return true;
}

export const commands = {
  'smart-contexts-dashboard': {
    name: 'Open: Management dashboard (show named contexts) view',

    register_when({ plugin }) {
      return plugin.manifest.id === 'smart-context';
    },

    params({ plugin }) {
      return { plugin };
    },

    get_scope({ env }) {
      return env.smart_contexts;
    },
  },
};

export const menus = {
  'smart_contexts:menu': {
    title: 'Open named contexts dashboard',
    icon: 'smart-named-contexts',
    order: 30,
  },
};

export const ribbon_icons = {
  list_contexts: {
    icon_name: 'smart-named-contexts',
    description: 'Smart Context: List Named Contexts',

    register_when({ plugin }) {
      return plugin.manifest.id === 'smart-context';
    },

    params({ plugin }) {
      return { plugin };
    },

    get_scope({ env }) {
      return env.smart_contexts;
    },
  },
};
