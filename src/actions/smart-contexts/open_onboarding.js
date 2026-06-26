const HELP_URL = 'https://smartconnections.app/smart-context/getting-started/';

/**
 * Open Smart Context codeblock help.
 *
 * @returns {boolean}
 */
export function smart_contexts_open_onboarding() {
  const open_url = globalThis.window?.open || globalThis.open;
  if (typeof open_url !== 'function') return false;

  open_url(HELP_URL, '_external');
  return true;
}

export const menus = {
  'smart_contexts:menu': {
    title: 'Getting started',
    icon: 'help-circle',
    order: 100,
  },
};

