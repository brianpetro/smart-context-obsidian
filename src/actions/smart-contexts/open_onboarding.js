import { StoryModal } from 'obsidian-smart-env/src/modals/story.js';

const HELP_URL = 'https://smartconnections.app/smart-context/getting-started/';
const COMMAND_HELP_URL = 'https://smartconnections.app/story/smart-context-getting-started/?utm_source=sc-command';

/**
 * Open Smart Context onboarding.
 *
 * @this {import('smart-contexts').SmartContexts}
 * @param {object} [params={}]
 * @returns {boolean}
 */
export function smart_contexts_open_onboarding(params = {}) {
  if (params.story && params.plugin) {
    StoryModal.open(params.plugin, {
      title: 'Getting Started With Smart Context',
      url: COMMAND_HELP_URL,
    });
    return true;
  }

  const open_url = globalThis.window?.open || globalThis.open;
  if (typeof open_url !== 'function') return false;

  open_url(HELP_URL, '_external');
  return true;
}

export const commands = {
  'show-getting-started': {
    name: 'Help: Show getting started',

    register_when({ plugin }) {
      return plugin.manifest.id === 'smart-context';
    },

    params({ plugin }) {
      return {
        plugin,
        story: true,
      };
    },

    get_scope({ env }) {
      return env.smart_contexts;
    },
  },
};

export const menus = {
  'smart_contexts:menu': {
    title: 'Getting started',
    icon: 'help-circle',
    order: 100,
  },
};
