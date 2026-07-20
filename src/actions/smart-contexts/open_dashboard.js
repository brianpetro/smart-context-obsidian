/**
 * Open the Smart Context named-contexts dashboard.
 *
 * @this {import('smart-contexts').SmartContexts} Collection scope
 * @param {object} [params={}]
 * @returns {boolean}
 */
export function smart_contexts_open_dashboard(params = {}) {
  const app = params.app
    || this?.env?.plugin?.app
    || this?.env?.obsidian_app
    || globalThis.app
  ;
  if (typeof app?.commands?.executeCommandById !== 'function') return false;

  app.commands.executeCommandById('smart-context:smart-contexts-dashboard');
  return true;
}

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

    params({ app }) {
      return { app };
    },

    get_scope({ env }) {
      return env.smart_contexts;
    },
  },
};
